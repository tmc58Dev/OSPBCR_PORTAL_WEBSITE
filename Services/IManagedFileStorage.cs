using Microsoft.AspNetCore.Http;

namespace OSPBCR_PORTAL.Services;

public interface IManagedFileStorage
{
    Task<string?> ValidateWebpAsync(IFormFile? file, bool required, CancellationToken cancellationToken = default);
    Task<string?> ValidatePdfAsync(IFormFile? file, bool required, CancellationToken cancellationToken = default);
    Task<string?> ValidatePreviewImageAsync(IFormFile? file, bool required, CancellationToken cancellationToken = default);
    Task<string> SaveWebpAsync(IFormFile file, string category, CancellationToken cancellationToken = default);
    Task<string> SavePdfAsync(IFormFile file, string category, CancellationToken cancellationToken = default);
    Task<string> SavePreviewImageAsync(IFormFile file, string category, CancellationToken cancellationToken = default);
    Task DeleteIfManagedAsync(string? publicPath, CancellationToken cancellationToken = default);
}
