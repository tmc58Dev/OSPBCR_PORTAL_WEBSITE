using OSPBCR_PORTAL.Models;

namespace OSPBCR_PORTAL.Services;

public interface IDistrictTrainingStore
{
    Task<IReadOnlyList<DistrictTrainingRecord>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<DistrictTrainingRecord?> GetAsync(int id, CancellationToken cancellationToken = default);
    Task<DistrictTrainingRecord> CreateAsync(
        DistrictTrainingFormViewModel form,
        CancellationToken cancellationToken = default);
    Task<DistrictTrainingRecord?> UpdateAsync(
        int id,
        DistrictTrainingFormViewModel form,
        CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(int id, CancellationToken cancellationToken = default);
}
