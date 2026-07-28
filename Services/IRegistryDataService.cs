using OSPBCR_PORTAL.Models;

namespace OSPBCR_PORTAL.Services;

public interface IRegistryDataService
{
    Task<DatabaseHealthDto> GetHealthAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DistrictStatusDto>> GetDistrictStatusAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DistrictStatisticsDto>> GetDistrictStatisticsAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<FacilityDto>> GetFacilitiesAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CancerSiteIncidenceDto>> GetCancerSiteIncidenceAsync(
        int year,
        int? sex,
        string? district,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<CancerSiteMortalityDto>> GetCancerSiteMortalityAsync(
        int year,
        int? sex,
        string? district,
        CancellationToken cancellationToken = default);
}
