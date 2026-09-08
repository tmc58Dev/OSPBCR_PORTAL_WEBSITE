using System.Globalization;
using System.IO.Compression;
using System.Net;
using System.Text;
using OSPBCR_PORTAL.Models;

namespace OSPBCR_PORTAL.Services;

public sealed class NewsDownloadService(IWebHostEnvironment environment) : INewsDownloadService
{
    private readonly string _webRoot = Path.GetFullPath(environment.WebRootPath);

    public async Task<NewsDownloadPackage> CreateAsync(
        NewsCard card,
        string language,
        CancellationToken cancellationToken = default)
    {
        if (!card.Translations.TryGetValue(language, out var translation))
        {
            throw new ArgumentException("The requested language is not available.", nameof(language));
        }

        var tempPath = Path.Combine(Path.GetTempPath(), $"ospbcr-news-{Guid.NewGuid():N}.zip");
        try
        {
            await using (var output = new FileStream(
                tempPath,
                FileMode.CreateNew,
                FileAccess.ReadWrite,
                FileShare.None,
                81920,
                FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                using var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true);
                var imageEntries = await AddImagesAsync(archive, card, cancellationToken);
                await AddAttachmentsAsync(archive, card.Attachments, cancellationToken);
                await WriteTextEntryAsync(
                    archive,
                    "index.html",
                    BuildHtml(card, translation, language, imageEntries),
                    cancellationToken);
                await WriteTextEntryAsync(
                    archive,
                    "README.txt",
                    BuildReadme(translation, language, card.Attachments.Count),
                    cancellationToken);
            }

            var slug = Slugify(translation.Title);
            var downloadName = $"news-{card.Id}-{language}-{slug}.zip";
            return new NewsDownloadPackage(tempPath, downloadName);
        }
        catch
        {
            TryDelete(tempPath);
            throw;
        }
    }

    private async Task<IReadOnlyList<string>> AddImagesAsync(
        ZipArchive archive,
        NewsCard card,
        CancellationToken cancellationToken)
    {
        var paths = card.ImagePaths.Count > 0
            ? card.ImagePaths
            : card.Translations.Values
                .Select(value => value.ImagePath)
                .Where(path => !string.IsNullOrWhiteSpace(path))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        var entries = new List<string>();
        for (var index = 0; index < paths.Count; index++)
        {
            var sourcePath = ResolveWebRootPath(paths[index]);
            if (sourcePath is null || !File.Exists(sourcePath))
            {
                continue;
            }

            var extension = Path.GetExtension(sourcePath).ToLowerInvariant();
            var entryName = $"images/photo-{index + 1:00}{extension}";
            await AddFileEntryAsync(archive, sourcePath, entryName, cancellationToken);
            entries.Add(entryName);
        }
        return entries;
    }

    private async Task AddAttachmentsAsync(
        ZipArchive archive,
        IReadOnlyList<NewsCardAttachment> attachments,
        CancellationToken cancellationToken)
    {
        var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var attachment in attachments)
        {
            var sourcePath = ResolveWebRootPath(attachment.StoredPath);
            if (sourcePath is null || !File.Exists(sourcePath))
            {
                continue;
            }

            var relativePath = SafeRelativePath(attachment.RelativePath);
            var entryName = UniqueEntryName($"attachments/{relativePath}", usedNames);
            await AddFileEntryAsync(archive, sourcePath, entryName, cancellationToken);
        }

        if (usedNames.Count == 0)
        {
            await WriteTextEntryAsync(
                archive,
                "attachments/README.txt",
                "No files were attached to this News Card.",
                cancellationToken);
        }
    }

    private string? ResolveWebRootPath(string? publicPath)
    {
        if (string.IsNullOrWhiteSpace(publicPath))
        {
            return null;
        }

        try
        {
            var pathOnly = publicPath.Split('?', '#')[0];
            var relative = Uri.UnescapeDataString(pathOnly)
                .TrimStart('/', '\\')
                .Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.GetFullPath(Path.Combine(_webRoot, relative));
            return fullPath.StartsWith(_webRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                ? fullPath
                : null;
        }
        catch (Exception exception) when (
            exception is ArgumentException or NotSupportedException or PathTooLongException or UriFormatException)
        {
            return null;
        }
    }

    private static async Task AddFileEntryAsync(
        ZipArchive archive,
        string sourcePath,
        string entryName,
        CancellationToken cancellationToken)
    {
        var entry = archive.CreateEntry(entryName.Replace('\\', '/'), CompressionLevel.Fastest);
        await using var source = new FileStream(
            sourcePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            81920,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        await using var destination = entry.Open();
        await source.CopyToAsync(destination, cancellationToken);
    }

    private static async Task WriteTextEntryAsync(
        ZipArchive archive,
        string entryName,
        string content,
        CancellationToken cancellationToken)
    {
        var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
        await using var stream = entry.Open();
        await using var writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
        await writer.WriteAsync(content.AsMemory(), cancellationToken);
    }

    private static string BuildHtml(
        NewsCard card,
        NewsCardTranslation translation,
        string language,
        IReadOnlyList<string> imageEntries)
    {
        var title = WebUtility.HtmlEncode(translation.Title);
        var note = WebUtility.HtmlEncode(translation.TextNote);
        var footer = WebUtility.HtmlEncode(translation.Footer);
        var languageName = language switch
        {
            "hi" => "हिन्दी",
            "or" => "ଓଡ଼ିଆ",
            _ => "English"
        };
        var publishedLabel = language switch
        {
            "hi" => "प्रकाशित दिनांक",
            "or" => "ପ୍ରକାଶିତ ତାରିଖ",
            _ => "Published On"
        };
        var images = string.Join(
            Environment.NewLine,
            imageEntries.Select((path, index) =>
                $"<figure><img src=\"{WebUtility.HtmlEncode(path)}\" alt=\"{title} — {index + 1}\" /></figure>"));

        return $$$"""
            <!doctype html>
            <html lang="{{{language}}}">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <title>{{{title}}} | OSPBCR</title>
              <style>
                :root{color-scheme:light;--primary:#0077b6;--primary-dark:#003f6b;--secondary:#00a6a6;--text:#12344d;--body:#36566d}
                *{box-sizing:border-box}
                body{margin:0;padding:clamp(18px,4vw,52px);color:var(--body);background:#eef5f8;font-family:"Noto Sans","Noto Sans Devanagari","Noto Sans Oriya","Nirmala UI","Segoe UI",Arial,sans-serif}
                article{width:min(1060px,100%);margin:auto;overflow:hidden;border:1px solid rgba(0,91,150,.14);border-radius:22px;background:#fff;box-shadow:0 24px 65px rgba(0,63,107,.15)}
                .gallery{display:grid;gap:16px;padding:clamp(14px,2.5vw,28px);background:linear-gradient(135deg,#dbeaf2,#edf6f8)}
                figure{display:grid;place-items:center;margin:0;overflow:hidden;border-radius:14px;background:#d8e6ee}
                img{display:block;width:100%;max-height:76vh;object-fit:contain}
                .content{display:grid;gap:22px;padding:clamp(26px,5vw,52px)}
                .meta{display:flex;align-items:center;gap:9px;color:var(--text);font-size:clamp(16px,2vw,21px);font-weight:850}
                .meta:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--secondary);box-shadow:0 0 0 5px rgba(0,166,166,.12)}
                .language{margin-left:auto;padding:6px 10px;color:#fff;border-radius:999px;background:var(--primary-dark);font-size:12px}
                h1{margin:0;color:var(--text);font-size:clamp(28px,4vw,48px);line-height:1.16;letter-spacing:-.025em;overflow-wrap:anywhere}
                .note{margin:0;color:var(--body);font-size:clamp(16px,1.8vw,19px);line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere}
                footer{display:flex;align-items:flex-start;gap:10px;padding:20px 22px;color:var(--primary-dark);border-left:4px solid var(--secondary);border-radius:0 10px 10px 0;background:linear-gradient(90deg,rgba(0,166,166,.11),rgba(0,119,182,.04));font-size:15px;font-weight:700;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
                footer:before{content:"OS";display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;color:#fff;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--secondary));font-size:9px;font-weight:900}
                @media print{body{padding:0;background:#fff}article{box-shadow:none}.gallery{break-after:auto}figure{break-inside:avoid}.content{padding:28px}}
              </style>
            </head>
            <body>
              <article>
                <section class="gallery">{{{images}}}</section>
                <section class="content">
                  <div class="meta"><span>{{{WebUtility.HtmlEncode(publishedLabel)}}}: {{{translation.PublishDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture)}}}</span><span class="language">{{{languageName}}}</span></div>
                  <h1>{{{title}}}</h1>
                  <p class="note">{{{note}}}</p>
                  <footer>{{{footer}}}</footer>
                </section>
              </article>
            </body>
            </html>
            """;
    }

    private static string BuildReadme(
        NewsCardTranslation translation,
        string language,
        int attachmentCount) =>
        $"""
        OSPBCR News Card
        =================
        Title: {translation.Title}
        Language: {language}
        Published: {translation.PublishDate:dd/MM/yyyy}

        Open index.html in a web browser to read or print the styled News Card.
        Images are stored in the images folder.
        Attached files ({attachmentCount}) are stored in the attachments folder, including their uploaded subfolders.
        """;

    private static string SafeRelativePath(string value)
    {
        var segments = value
            .Replace('\\', '/')
            .Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(segment => segment is not "." and not "..")
            .Select(SafeFileName)
            .Where(segment => !string.IsNullOrWhiteSpace(segment))
            .ToList();
        return segments.Count > 0 ? string.Join('/', segments) : "attachment";
    }

    private static string SafeFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars().ToHashSet();
        var safe = new string(value.Select(character => invalid.Contains(character) ? '_' : character).ToArray()).Trim();
        return safe.Length > 120 ? safe[..120] : safe;
    }

    private static string UniqueEntryName(string proposed, ISet<string> used)
    {
        if (used.Add(proposed))
        {
            return proposed;
        }

        var directory = Path.GetDirectoryName(proposed)?.Replace('\\', '/');
        var extension = Path.GetExtension(proposed);
        var stem = Path.GetFileNameWithoutExtension(proposed);
        for (var suffix = 2; ; suffix++)
        {
            var fileName = $"{stem} ({suffix}){extension}";
            var candidate = string.IsNullOrWhiteSpace(directory) ? fileName : $"{directory}/{fileName}";
            if (used.Add(candidate))
            {
                return candidate;
            }
        }
    }

    private static string Slugify(string value)
    {
        var characters = value.Normalize(NormalizationForm.FormD)
            .Where(character => char.IsLetterOrDigit(character) || char.IsWhiteSpace(character) || character == '-')
            .Take(60)
            .Select(character => char.IsWhiteSpace(character) ? '-' : char.ToLowerInvariant(character))
            .ToArray();
        var slug = new string(characters).Trim('-');
        return string.IsNullOrWhiteSpace(slug) ? "news-card" : slug;
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }
}
