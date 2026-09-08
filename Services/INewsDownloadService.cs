using OSPBCR_PORTAL.Models;

namespace OSPBCR_PORTAL.Services;

public sealed record NewsDownloadPackage(string FilePath, string DownloadName);

public interface INewsDownloadService
{
    Task<NewsDownloadPackage> CreateAsync(
        NewsCard card,
        string language,
        CancellationToken cancellationToken = default);
}
