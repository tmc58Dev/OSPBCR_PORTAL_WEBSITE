using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OSPBCR_PORTAL.Data;
using OSPBCR_PORTAL.Models;
using OSPBCR_PORTAL.Services;

namespace OSPBCR_PORTAL.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/content")]
public sealed class ContentController(
    ICmsRepository repository,
    IDistrictTrainingStore trainingStore,
    INewsDownloadService newsDownloads,
    IWebHostEnvironment environment,
    ILogger<ContentController> logger) : ControllerBase
{
    private const string WebsiteVisitCookieName = "OSPBCR.WebsiteVisited";

    private readonly string _cancerBurdenPdfRoot = Path.GetFullPath(Path.Combine(
        environment.WebRootPath,
        "assets",
        "IMAGES_PDF_PPT_EXCEL",
        "CANCER BURDEN",
        "PDF"));

    [HttpGet("news")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> News([FromQuery] string language = "en", CancellationToken cancellationToken = default)
    {
        language = language.ToLowerInvariant();
        language = language is "all" or "en" or "hi" or "or" ? language : "en";
        try
        {
            var cards = await repository.GetPublishedNewsAsync(language, cancellationToken);
            return Ok(cards.Select(card => card with
            {
                ImagePath = Url.ApplicationContent(card.ImagePath),
                ImagePaths = card.ImagePaths.Select(path => Url.ApplicationContent(path)).ToArray()
            }));
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Published News Cards could not be loaded.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "News Cards are temporarily unavailable." });
        }
    }

    [HttpGet("news/{id:int}/download")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> DownloadNews(
        int id,
        [FromQuery] string language = "en",
        CancellationToken cancellationToken = default)
    {
        language = language.ToLowerInvariant();
        language = language is "en" or "hi" or "or" ? language : "en";
        try
        {
            var card = await repository.GetNewsCardAsync(id, cancellationToken);
            if (card is null || card.Status != "Published" || !card.Translations.ContainsKey(language))
            {
                return NotFound();
            }

            var package = await newsDownloads.CreateAsync(card, language, cancellationToken);
            Response.OnCompleted(() =>
            {
                try
                {
                    System.IO.File.Delete(package.FilePath);
                }
                catch (IOException)
                {
                }
                catch (UnauthorizedAccessException)
                {
                }
                return Task.CompletedTask;
            });
            return PhysicalFile(package.FilePath, "application/zip", package.DownloadName);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "News Card {NewsCardId} could not be prepared for download.", id);
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { message = "This News Card download is temporarily unavailable." });
        }
    }

    [HttpPost("website-visits")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> WebsiteVisits(CancellationToken cancellationToken = default)
    {
        try
        {
            var isReturningBrowser = Request.Cookies.ContainsKey(WebsiteVisitCookieName);
            var count = isReturningBrowser
                ? await repository.GetWebsiteVisitCountAsync(cancellationToken)
                : await repository.IncrementWebsiteVisitCountAsync(cancellationToken);

            if (!isReturningBrowser)
            {
                Response.Cookies.Append(WebsiteVisitCookieName, "1", new CookieOptions
                {
                    HttpOnly = true,
                    IsEssential = true,
                    MaxAge = TimeSpan.FromDays(3650),
                    Path = Request.PathBase.HasValue ? Request.PathBase.Value : "/",
                    SameSite = SameSiteMode.Lax,
                    Secure = Request.IsHttps
                });
            }

            return Ok(new { count, counted = !isReturningBrowser });
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Website visit count could not be updated.");
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { message = "Website visit count is temporarily unavailable." });
        }
    }

    [HttpGet("training-pdfs")]
    [ResponseCache(Duration = 30, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> TrainingPdfs(
        [FromQuery] string language = "en",
        CancellationToken cancellationToken = default) =>
        Ok((await trainingStore.GetAllAsync(cancellationToken)).Select(record => Localize(
            record.Id, record.District, record.Title, record.Description,
            record.TitleHi, record.DescriptionHi, record.TitleOr, record.DescriptionOr,
            record.PdfPath, record.PreviewPath, language)));

    [HttpGet("cancer-burden-pdfs")]
    [ResponseCache(Duration = 30, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> CancerBurdenPdfs(
        [FromQuery] string language = "en",
        CancellationToken cancellationToken = default)
    {
        try
        {
            var records = await repository.GetCancerBurdenRecordsAsync(cancellationToken);
            return Ok(records
                .Where(record => IsCancerBurdenPdfPresent(record.PdfPath))
                .Select(record => Localize(
                    record.Id, record.District, record.Title, record.Description,
                    record.TitleHi, record.DescriptionHi, record.TitleOr, record.DescriptionOr,
                    record.PdfPath, record.PreviewPath, language)));
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Cancer burden PDF records could not be loaded.");
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { message = "Cancer burden PDFs are temporarily unavailable." });
        }
    }

    private bool IsCancerBurdenPdfPresent(string publicPath)
    {
        if (string.IsNullOrWhiteSpace(publicPath))
        {
            return false;
        }

        try
        {
            var pathWithoutQuery = publicPath.Split('?', '#')[0];
            var relativePath = Uri.UnescapeDataString(pathWithoutQuery)
                .TrimStart('/', '\\')
                .Replace('/', Path.DirectorySeparatorChar);
            var fullPath = Path.GetFullPath(Path.Combine(environment.WebRootPath, relativePath));

            return string.Equals(Path.GetExtension(fullPath), ".pdf", StringComparison.OrdinalIgnoreCase) &&
                fullPath.StartsWith(_cancerBurdenPdfRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) &&
                System.IO.File.Exists(fullPath);
        }
        catch (Exception exception) when (exception is ArgumentException or NotSupportedException or PathTooLongException or UriFormatException)
        {
            return false;
        }
    }

    [HttpGet("odisha-circulars")]
    [ResponseCache(Duration = 30, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> OdishaCirculars(
        [FromQuery] string language = "en",
        CancellationToken cancellationToken = default)
    {
        try
        {
            return Ok((await repository.GetOdishaCircularRecordsAsync(cancellationToken)).Select(record => Localize(
                record.Id, record.District, record.Title, record.Description,
                record.TitleHi, record.DescriptionHi, record.TitleOr, record.DescriptionOr,
                record.PdfPath, record.PreviewPath, language)));
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Odisha State circular records could not be loaded.");
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new { message = "Odisha State circulars are temporarily unavailable." });
        }
    }

    private PublicPdfResource Localize(
        object id,
        string district,
        string title,
        string description,
        string titleHi,
        string descriptionHi,
        string titleOr,
        string descriptionOr,
        string pdfPath,
        string previewPath,
        string language)
    {
        var localized = language.ToLowerInvariant() switch
        {
            "hi" => (titleHi, descriptionHi),
            "or" => (titleOr, descriptionOr),
            _ => (title, description)
        };
        return new PublicPdfResource(
            id,
            district,
            string.IsNullOrWhiteSpace(localized.Item1) ? title : localized.Item1,
            string.IsNullOrWhiteSpace(localized.Item2) ? description : localized.Item2,
            Url.ApplicationContent(pdfPath),
            Url.ApplicationContent(previewPath));
    }
}
