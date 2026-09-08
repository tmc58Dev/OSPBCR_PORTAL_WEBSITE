using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;

namespace OSPBCR_PORTAL.Models;

public static class CmsRoles
{
    public const string Admin = "Admin";
    public const string User = "User";
    public const string All = Admin + "," + User;
}

public sealed class CmsUser
{
    public int Id { get; set; }
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = CmsRoles.User;
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class LoginViewModel
{
    [Required, StringLength(80)]
    public string Username { get; set; } = "";

    [Required, DataType(DataType.Password)]
    public string Password { get; set; } = "";

    public string? ReturnUrl { get; set; }
}

public sealed class UserFormViewModel
{
    public int Id { get; set; }

    [Required, StringLength(80, MinimumLength = 3)]
    [RegularExpression(@"^[A-Za-z0-9._-]+$", ErrorMessage = "Use letters, numbers, dots, underscores, or hyphens only.")]
    public string Username { get; set; } = "";

    [DataType(DataType.Password)]
    [StringLength(128, MinimumLength = 8, ErrorMessage = "Passwords must be at least 8 characters.")]
    public string? Password { get; set; }

    [Required]
    public string Role { get; set; } = CmsRoles.User;

    public bool IsActive { get; set; } = true;
}

public sealed class NewsCard
{
    public int Id { get; set; }
    public string Status { get; set; } = "Published";
    public int CreatedById { get; set; }
    public string CreatedByName { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public int UpdatedById { get; set; }
    public string UpdatedByName { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; }
    public List<string> ImagePaths { get; set; } = [];
    public List<NewsCardAttachment> Attachments { get; set; } = [];
    public Dictionary<string, NewsCardTranslation> Translations { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class NewsCardAttachment
{
    public int Id { get; set; }
    public string StoredPath { get; set; } = "";
    public string RelativePath { get; set; } = "";
    public string ContentType { get; set; } = "application/octet-stream";
    public long FileSize { get; set; }
}

public sealed class NewsCardTranslation
{
    public string LanguageCode { get; set; } = "";
    public string Title { get; set; } = "";
    public DateOnly PublishDate { get; set; }
    public string ImagePath { get; set; } = "";
    public string TextNote { get; set; } = "";
    public string Footer { get; set; } = "";
}

public sealed class NewsLanguageInput
{
    public const int MaxContentLength = 100_000;

    [Required, StringLength(MaxContentLength)]
    public string Title { get; set; } = "";

    [Required]
    [RegularExpression(@"^(0[1-9]|[12]\d|3[01])/(0[1-9]|1[0-2])/\d{4}$", ErrorMessage = "Use DD/MM/YYYY format.")]
    public string PublishDate { get; set; } = "";

    [Required, StringLength(MaxContentLength)]
    public string TextNote { get; set; } = "";

    [Required, StringLength(MaxContentLength)]
    public string Footer { get; set; } = "";
}

public sealed class NewsCardFormViewModel
{
    public int Id { get; set; }
    public bool IsPublished { get; set; } = true;
    public List<IFormFile>? Photos { get; set; }
    public List<string> ExistingPhotoPaths { get; set; } = [];
    public List<string> RemovePhotoPaths { get; set; } = [];
    public List<string> PhotoOrder { get; set; } = [];
    public List<IFormFile>? Attachments { get; set; }
    public List<NewsCardAttachment> ExistingAttachments { get; set; } = [];
    public List<int> RemoveAttachmentIds { get; set; } = [];
    public NewsLanguageInput English { get; set; } = new();
    public NewsLanguageInput Hindi { get; set; } = new();
    public NewsLanguageInput Odia { get; set; } = new();
}

public sealed record PublicNewsCard(
    int Id,
    string Language,
    string Title,
    string PublishDate,
    string ImagePath,
    IReadOnlyList<string> ImagePaths,
    string TextNote,
    string Footer,
    int AttachmentCount,
    DateTimeOffset UpdatedAt);

public sealed class PdfResourceLanguageInput
{
    [Required, StringLength(250)]
    public string Title { get; set; } = "";

    [Required, StringLength(2000)]
    public string Description { get; set; } = "";
}

public sealed record PublicPdfResource(
    object Id,
    string District,
    string Title,
    string Description,
    string PdfPath,
    string PreviewPath);

public sealed class DistrictTrainingRecord
{
    public Guid Id { get; set; }
    public string District { get; set; } = "";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string TitleHi { get; set; } = "";
    public string DescriptionHi { get; set; } = "";
    public string TitleOr { get; set; } = "";
    public string DescriptionOr { get; set; } = "";
    public string PdfPath { get; set; } = "";
    public string PreviewPath { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class DistrictTrainingFormViewModel
{
    public Guid? Id { get; set; }

    [Required]
    public string District { get; set; } = "";

    public PdfResourceLanguageInput English { get; set; } = new();
    public PdfResourceLanguageInput Hindi { get; set; } = new();
    public PdfResourceLanguageInput Odia { get; set; } = new();

    public IFormFile? PdfFile { get; set; }
    public IFormFile? PreviewImage { get; set; }
    public string? ExistingPdfPath { get; set; }
    public string? ExistingPreviewPath { get; set; }
}

public sealed class CancerBurdenRecord
{
    public int Id { get; set; }
    public string District { get; set; } = "";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string TitleHi { get; set; } = "";
    public string DescriptionHi { get; set; } = "";
    public string TitleOr { get; set; } = "";
    public string DescriptionOr { get; set; } = "";
    public string PdfPath { get; set; } = "";
    public string PreviewPath { get; set; } = "";
    public int? CreatedById { get; set; }
    public int? UpdatedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class CancerBurdenFormViewModel
{
    public int? Id { get; set; }

    [Required]
    public string District { get; set; } = "";

    public PdfResourceLanguageInput English { get; set; } = new();
    public PdfResourceLanguageInput Hindi { get; set; } = new();
    public PdfResourceLanguageInput Odia { get; set; } = new();

    public IFormFile? PdfFile { get; set; }
    public IFormFile? PreviewImage { get; set; }
    public string? ExistingPdfPath { get; set; }
    public string? ExistingPreviewPath { get; set; }
}

public sealed class OdishaCircularRecord
{
    public int Id { get; set; }
    public string District { get; set; } = "";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string TitleHi { get; set; } = "";
    public string DescriptionHi { get; set; } = "";
    public string TitleOr { get; set; } = "";
    public string DescriptionOr { get; set; } = "";
    public string PdfPath { get; set; } = "";
    public string PreviewPath { get; set; } = "";
    public int? CreatedById { get; set; }
    public int? UpdatedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class OdishaCircularFormViewModel
{
    public int? Id { get; set; }

    [Required]
    public string District { get; set; } = "";

    public PdfResourceLanguageInput English { get; set; } = new();
    public PdfResourceLanguageInput Hindi { get; set; } = new();
    public PdfResourceLanguageInput Odia { get; set; } = new();

    public IFormFile? PdfFile { get; set; }
    public IFormFile? PreviewImage { get; set; }
    public string? ExistingPdfPath { get; set; }
    public string? ExistingPreviewPath { get; set; }
}

public sealed class DashboardViewModel
{
    public int UserCount { get; set; }
    public int NewsCount { get; set; }
    public int TrainingPdfCount { get; set; }
    public int CancerBurdenPdfCount { get; set; }
    public int OdishaCircularCount { get; set; }
}
