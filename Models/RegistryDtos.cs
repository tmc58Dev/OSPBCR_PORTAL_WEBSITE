namespace OSPBCR_PORTAL.Models;

public sealed record DatabaseHealthDto(
    bool Connected,
    string? DatabaseName,
    string? ServerName,
    int? TableCount,
    string? Error);

public sealed record DistrictStatusDto(
    string District,
    long Target,
    long Submitted,
    long Pending,
    decimal Completion);

public sealed record DistrictStatisticsDto(
    string District,
    long Population,
    long CancerCases,
    long IncidentCancerCases,
    long MortalityCancerCases);

public sealed record FacilityDto(
    string District,
    string Hospital,
    string Type,
    long Cases);

public sealed record CancerSiteIncidenceDto(
    string Icd10,
    string CancerSite,
    long Count);

public sealed record CancerSiteMortalityDto(
    string Icd10,
    string CancerSite,
    long Count);
