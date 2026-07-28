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
}
