using OSPBCR_PORTAL.Models;

namespace OSPBCR_PORTAL.Data;

public interface ICmsRepository
{
    Task InitializeAsync(CancellationToken cancellationToken = default);
    Task<CmsUser?> FindUserByUsernameAsync(string username, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CmsUser>> GetUsersAsync(CancellationToken cancellationToken = default);
    Task<int> CountUsersAsync(CancellationToken cancellationToken = default);
    Task<int> CreateUserAsync(CmsUser user, CancellationToken cancellationToken = default);
    Task<bool> UpdateUserAsync(CmsUser user, string? newPasswordHash, CancellationToken cancellationToken = default);
    Task<bool> DeleteUserAsync(int id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<NewsCard>> GetNewsCardsAsync(CancellationToken cancellationToken = default);
    Task<int> CountNewsCardsAsync(CancellationToken cancellationToken = default);
    Task<NewsCard?> GetNewsCardAsync(int id, CancellationToken cancellationToken = default);
    Task<int> CreateNewsCardAsync(NewsCard card, CancellationToken cancellationToken = default);
    Task<bool> UpdateNewsCardAsync(NewsCard card, CancellationToken cancellationToken = default);
    Task<bool> DeleteNewsCardAsync(int id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PublicNewsCard>> GetPublishedNewsAsync(string language, CancellationToken cancellationToken = default);
    Task<long> GetWebsiteVisitCountAsync(CancellationToken cancellationToken = default);
    Task<long> IncrementWebsiteVisitCountAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<CancerBurdenRecord>> GetCancerBurdenRecordsAsync(CancellationToken cancellationToken = default);
    Task<CancerBurdenRecord?> GetCancerBurdenRecordAsync(int id, CancellationToken cancellationToken = default);
    Task<int> CountCancerBurdenRecordsAsync(CancellationToken cancellationToken = default);
    Task<int> CreateCancerBurdenRecordAsync(CancerBurdenRecord record, CancellationToken cancellationToken = default);
    Task<bool> UpdateCancerBurdenRecordAsync(CancerBurdenRecord record, CancellationToken cancellationToken = default);
    Task<bool> DeleteCancerBurdenRecordAsync(int id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<OdishaCircularRecord>> GetOdishaCircularRecordsAsync(CancellationToken cancellationToken = default);
    Task<OdishaCircularRecord?> GetOdishaCircularRecordAsync(int id, CancellationToken cancellationToken = default);
    Task<int> CountOdishaCircularRecordsAsync(CancellationToken cancellationToken = default);
    Task<int> CreateOdishaCircularRecordAsync(OdishaCircularRecord record, CancellationToken cancellationToken = default);
    Task<bool> UpdateOdishaCircularRecordAsync(OdishaCircularRecord record, CancellationToken cancellationToken = default);
    Task<bool> DeleteOdishaCircularRecordAsync(int id, CancellationToken cancellationToken = default);
}
