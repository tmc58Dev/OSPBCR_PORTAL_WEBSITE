using Microsoft.AspNetCore.Http;

namespace OSPBCR_PORTAL.Services;

public sealed class ManagedFileStorage(IWebHostEnvironment environment) : IManagedFileStorage
{
    private const long MaxImageBytes = 5 * 1024 * 1024;
    private const long MaxPdfBytes = 25 * 1024 * 1024;
    private readonly string _uploadRoot = Path.GetFullPath(Path.Combine(environment.WebRootPath, "uploads"));

    public Task<string?> ValidateWebpAsync(
        IFormFile? file,
        bool required,
        CancellationToken cancellationToken = default) =>
        ValidateAsync(file, required, ".webp", "image/webp", MaxImageBytes, IsWebpAsync, cancellationToken);

    public Task<string?> ValidatePdfAsync(
        IFormFile? file,
        bool required,
        CancellationToken cancellationToken = default) =>
        ValidateAsync(file, required, ".pdf", "application/pdf", MaxPdfBytes, IsPdfAsync, cancellationToken);

    public Task<string> SaveWebpAsync(IFormFile file, string category, CancellationToken cancellationToken = default) =>
        SaveAsync(file, category, ".webp", cancellationToken);

    public Task<string> SavePdfAsync(IFormFile file, string category, CancellationToken cancellationToken = default) =>
        SaveAsync(file, category, ".pdf", cancellationToken);

    public Task DeleteIfManagedAsync(string? publicPath, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(publicPath) ||
            !publicPath.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase))
        {
            return Task.CompletedTask;
        }

        var relative = publicPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        var fullPath = Path.GetFullPath(Path.Combine(environment.WebRootPath, relative));
        if (!fullPath.StartsWith(_uploadRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            return Task.CompletedTask;
        }

        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
        }
        return Task.CompletedTask;
    }

    private async Task<string> SaveAsync(
        IFormFile file,
        string category,
        string extension,
        CancellationToken cancellationToken)
    {
        var safeCategory = new string(category.Where(character => char.IsLetterOrDigit(character) || character == '-').ToArray());
        if (string.IsNullOrWhiteSpace(safeCategory))
        {
            throw new InvalidOperationException("The upload category is invalid.");
        }

        var directory = Path.Combine(_uploadRoot, safeCategory);
        Directory.CreateDirectory(directory);
        var fileName = $"{Guid.NewGuid():N}{extension}";
        var fullPath = Path.Combine(directory, fileName);
        await using var output = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true);
        await file.CopyToAsync(output, cancellationToken);
        return $"/uploads/{safeCategory}/{fileName}";
    }

    private static async Task<string?> ValidateAsync(
        IFormFile? file,
        bool required,
        string extension,
        string contentType,
        long maxBytes,
        Func<IFormFile, CancellationToken, Task<bool>> signatureValidator,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return required ? "This file is required." : null;
        }
        if (!string.Equals(Path.GetExtension(file.FileName), extension, StringComparison.OrdinalIgnoreCase))
        {
            return $"Only {extension} files are accepted.";
        }
        if (!string.Equals(file.ContentType, contentType, StringComparison.OrdinalIgnoreCase))
        {
            return $"The file MIME type must be {contentType}.";
        }
        if (file.Length > maxBytes)
        {
            return $"The file must be no larger than {maxBytes / 1024 / 1024} MB.";
        }
        if (!await signatureValidator(file, cancellationToken))
        {
            return $"The uploaded file does not contain a valid {extension} signature.";
        }
        return null;
    }

    private static async Task<bool> IsWebpAsync(IFormFile file, CancellationToken cancellationToken)
    {
        var header = new byte[12];
        await using var stream = file.OpenReadStream();
        if (await stream.ReadAsync(header, cancellationToken) != header.Length)
        {
            return false;
        }
        return header.AsSpan(0, 4).SequenceEqual("RIFF"u8) &&
               header.AsSpan(8, 4).SequenceEqual("WEBP"u8);
    }

    private static async Task<bool> IsPdfAsync(IFormFile file, CancellationToken cancellationToken)
    {
        var header = new byte[5];
        await using var stream = file.OpenReadStream();
        if (await stream.ReadAsync(header, cancellationToken) != header.Length)
        {
            return false;
        }
        return header.AsSpan().SequenceEqual("%PDF-"u8);
    }
}
