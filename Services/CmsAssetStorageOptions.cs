namespace OSPBCR_PORTAL.Services;

public sealed class CmsAssetStorageOptions
{
    public const string SectionName = "CmsAssets";

    public string RootPath { get; set; } = @"D:\OSPBCR_ASSESTS";

    public string RequestPath { get; set; } = "/cms-assets";
}
