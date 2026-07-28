using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using OSPBCR_PORTAL.Data;
using OSPBCR_PORTAL.Models;
using OSPBCR_PORTAL.Services;

namespace OSPBCR_PORTAL.Controllers;

[Authorize(Roles = CmsRoles.All)]
public sealed class AdminController(
    ICmsRepository repository,
    IPasswordHasher<CmsUser> passwordHasher,
    IManagedFileStorage files,
    IDistrictTrainingStore trainingStore) : Controller
{
    private const int MaxNewsPhotos = 100;
    private const long MaxNewsRequestBytes = 525L * 1024 * 1024;

    public static readonly IReadOnlyList<string> Districts =
    [
        "Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack", "Deogarh",
        "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghpur", "Jajpur", "Jharsuguda", "Kalahandi",
        "Kandhamal", "Kendrapara", "Keonjhar", "Khordha", "Koraput", "Malkangiri", "Mayurbhanj",
        "Nabarangpur", "Nayagarh", "Nuapada", "Puri", "Rayagada", "Sambalpur", "Subarnapur", "Sundargarh"
    ];

    [HttpGet]
    public async Task<IActionResult> Dashboard(CancellationToken cancellationToken)
    {
        var model = new DashboardViewModel
        {
            UserCount = await repository.CountUsersAsync(cancellationToken),
            NewsCount = await repository.CountNewsCardsAsync(cancellationToken),
            TrainingPdfCount = (await trainingStore.GetAllAsync(cancellationToken)).Count
        };
        return View(model);
    }

    [Authorize(Roles = CmsRoles.Admin)]
    [HttpGet]
    public async Task<IActionResult> Users(CancellationToken cancellationToken) =>
        View(await repository.GetUsersAsync(cancellationToken));

    [Authorize(Roles = CmsRoles.Admin)]
    [HttpGet]
    public IActionResult CreateUser() => View("UserForm", new UserFormViewModel());

    [Authorize(Roles = CmsRoles.Admin)]
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> CreateUser(UserFormViewModel model, CancellationToken cancellationToken)
    {
        ValidateRole(model.Role);
        if (string.IsNullOrWhiteSpace(model.Password))
        {
            ModelState.AddModelError(nameof(model.Password), "A password is required.");
        }
        if (!ModelState.IsValid)
        {
            return View("UserForm", model);
        }

        var user = new CmsUser
        {
            Username = model.Username.Trim(),
            Role = model.Role,
            IsActive = model.IsActive
        };
        user.PasswordHash = passwordHasher.HashPassword(user, model.Password!);
        try
        {
            await repository.CreateUserAsync(user, cancellationToken);
            TempData["Success"] = $"User “{user.Username}” was created.";
            return RedirectToAction(nameof(Users));
        }
        catch (SqlException exception) when (exception.Number is 2601 or 2627)
        {
            ModelState.AddModelError(nameof(model.Username), "That username is already in use.");
            return View("UserForm", model);
        }
    }

    [Authorize(Roles = CmsRoles.Admin)]
    [HttpGet]
    public async Task<IActionResult> EditUser(int id, CancellationToken cancellationToken)
    {
        var user = (await repository.GetUsersAsync(cancellationToken)).SingleOrDefault(item => item.Id == id);
        if (user is null)
        {
            return NotFound();
        }
        return View("UserForm", new UserFormViewModel
        {
            Id = user.Id,
            Username = user.Username,
            Role = user.Role,
            IsActive = user.IsActive
        });
    }

    [Authorize(Roles = CmsRoles.Admin)]
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> EditUser(UserFormViewModel model, CancellationToken cancellationToken)
    {
        ValidateRole(model.Role);
        var currentUserId = GetCurrentUserId();
        if (model.Id == currentUserId && (!model.IsActive || model.Role != CmsRoles.Admin))
        {
            ModelState.AddModelError("", "You cannot deactivate your own account or remove your own Admin role.");
        }
        if (!ModelState.IsValid)
        {
            return View("UserForm", model);
        }

        var user = new CmsUser
        {
            Id = model.Id,
            Username = model.Username.Trim(),
            Role = model.Role,
            IsActive = model.IsActive
        };
        var passwordHash = string.IsNullOrWhiteSpace(model.Password)
            ? null
            : passwordHasher.HashPassword(user, model.Password);
        try
        {
            if (!await repository.UpdateUserAsync(user, passwordHash, cancellationToken))
            {
                return NotFound();
            }
            TempData["Success"] = $"User “{user.Username}” was updated.";
            return RedirectToAction(nameof(Users));
        }
        catch (SqlException exception) when (exception.Number is 2601 or 2627)
        {
            ModelState.AddModelError(nameof(model.Username), "That username is already in use.");
            return View("UserForm", model);
        }
    }

    [Authorize(Roles = CmsRoles.Admin)]
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteUser(int id, CancellationToken cancellationToken)
    {
        var user = (await repository.GetUsersAsync(cancellationToken)).SingleOrDefault(item => item.Id == id);
        if (user is null)
        {
            return NotFound();
        }
        if (id == GetCurrentUserId() || user.Username.Equals("admin", StringComparison.OrdinalIgnoreCase))
        {
            TempData["Error"] = "The signed-in account and built-in admin account cannot be deleted.";
            return RedirectToAction(nameof(Users));
        }
        if (!await repository.DeleteUserAsync(id, cancellationToken))
        {
            TempData["Error"] = "This user is referenced by News Cards and cannot be deleted. Deactivate the account instead.";
        }
        else
        {
            TempData["Success"] = $"User “{user.Username}” was deleted.";
        }
        return RedirectToAction(nameof(Users));
    }

    [HttpGet]
    public async Task<IActionResult> News(CancellationToken cancellationToken) =>
        View(await repository.GetNewsCardsAsync(cancellationToken));

    [HttpGet]
    public IActionResult CreateNews() => View("NewsForm", NewNewsForm());

    [HttpPost]
    [ValidateAntiForgeryToken]
    [RequestSizeLimit(MaxNewsRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxNewsRequestBytes)]
    public async Task<IActionResult> CreateNews(NewsCardFormViewModel model, CancellationToken cancellationToken)
    {
        await ValidateNewsPhotosAsync(model.Photos, 0, cancellationToken);
        var translations = ParseTranslations(model);
        if (!ModelState.IsValid)
        {
            return View("NewsForm", model);
        }

        var saved = new List<string>();
        try
        {
            foreach (var photo in model.Photos.Where(photo => photo.Length > 0))
            {
                var path = await files.SaveWebpAsync(photo, "news", cancellationToken);
                saved.Add(path);
            }
            var primaryImagePath = saved[0];
            foreach (var translation in translations.Values)
            {
                translation.ImagePath = primaryImagePath;
            }
            var userId = GetCurrentUserId();
            var card = new NewsCard
            {
                Status = model.IsPublished ? "Published" : "Draft",
                CreatedById = userId,
                UpdatedById = userId,
                ImagePaths = saved,
                Translations = translations
            };
            await repository.CreateNewsCardAsync(card, cancellationToken);
            TempData["Success"] = $"The multilingual News Card was created with {saved.Count} shared photo(s).";
            return RedirectToAction(nameof(News));
        }
        catch
        {
            foreach (var path in saved)
            {
                await files.DeleteIfManagedAsync(path, cancellationToken);
            }
            throw;
        }
    }

    [HttpGet]
    public async Task<IActionResult> EditNews(int id, CancellationToken cancellationToken)
    {
        var card = await repository.GetNewsCardAsync(id, cancellationToken);
        return card is null ? NotFound() : View("NewsForm", ToForm(card));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    [RequestSizeLimit(MaxNewsRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxNewsRequestBytes)]
    public async Task<IActionResult> EditNews(NewsCardFormViewModel model, CancellationToken cancellationToken)
    {
        var existing = await repository.GetNewsCardAsync(model.Id, cancellationToken);
        if (existing is null)
        {
            return NotFound();
        }

        var existingPaths = ExistingNewsPaths(existing);
        var requestedRemovals = model.RemovePhotoPaths
            .Where(path => existingPaths.Contains(path, StringComparer.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var retainedPaths = existingPaths
            .Where(path => !requestedRemovals.Contains(path, StringComparer.OrdinalIgnoreCase))
            .ToList();
        model.ExistingPhotoPaths = existingPaths;

        await ValidateNewsPhotosAsync(model.Photos, retainedPaths.Count, cancellationToken);
        var translations = ParseTranslations(model);
        if (!ModelState.IsValid)
        {
            return View("NewsForm", model);
        }

        var newPaths = new List<string>();
        try
        {
            foreach (var photo in model.Photos.Where(photo => photo.Length > 0))
            {
                var path = await files.SaveWebpAsync(photo, "news", cancellationToken);
                newPaths.Add(path);
            }
            var finalPaths = retainedPaths.Concat(newPaths).ToList();
            var primaryImagePath = finalPaths[0];
            foreach (var translation in translations.Values)
            {
                translation.ImagePath = primaryImagePath;
            }
            var card = new NewsCard
            {
                Id = model.Id,
                Status = model.IsPublished ? "Published" : "Draft",
                UpdatedById = GetCurrentUserId(),
                ImagePaths = finalPaths,
                Translations = translations
            };
            if (!await repository.UpdateNewsCardAsync(card, cancellationToken))
            {
                foreach (var path in newPaths)
                {
                    await files.DeleteIfManagedAsync(path, cancellationToken);
                }
                return NotFound();
            }
            foreach (var path in requestedRemovals)
            {
                await files.DeleteIfManagedAsync(path, cancellationToken);
            }
            TempData["Success"] =
                $"The News Card was updated with {finalPaths.Count} shared photo(s), and the public pages now reflect the changes.";
            return RedirectToAction(nameof(News));
        }
        catch
        {
            foreach (var path in newPaths)
            {
                await files.DeleteIfManagedAsync(path, cancellationToken);
            }
            throw;
        }
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteNews(int id, CancellationToken cancellationToken)
    {
        var card = await repository.GetNewsCardAsync(id, cancellationToken);
        if (card is null)
        {
            return NotFound();
        }
        if (!await repository.DeleteNewsCardAsync(id, cancellationToken))
        {
            return NotFound();
        }
        foreach (var imagePath in ExistingNewsPaths(card))
        {
            await files.DeleteIfManagedAsync(imagePath, cancellationToken);
        }
        TempData["Success"] = "The News Card and its managed images were deleted.";
        return RedirectToAction(nameof(News));
    }

    [HttpGet]
    public async Task<IActionResult> Training(CancellationToken cancellationToken) =>
        View(await trainingStore.GetAllAsync(cancellationToken));

    [HttpGet]
    public IActionResult CreateTraining()
    {
        SetDistricts();
        return View("TrainingForm", new DistrictTrainingFormViewModel());
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    [RequestFormLimits(MultipartBodyLengthLimit = 35 * 1024 * 1024)]
    public async Task<IActionResult> CreateTraining(DistrictTrainingFormViewModel model, CancellationToken cancellationToken)
    {
        await ValidateTrainingAsync(model, true, cancellationToken);
        if (!ModelState.IsValid)
        {
            SetDistricts();
            return View("TrainingForm", model);
        }
        await trainingStore.CreateAsync(model, cancellationToken);
        TempData["Success"] = "The district training PDF was added to the public Training page.";
        return RedirectToAction(nameof(Training));
    }

    [HttpGet]
    public async Task<IActionResult> EditTraining(Guid id, CancellationToken cancellationToken)
    {
        var record = await trainingStore.GetAsync(id, cancellationToken);
        if (record is null)
        {
            return NotFound();
        }
        SetDistricts();
        return View("TrainingForm", new DistrictTrainingFormViewModel
        {
            Id = record.Id,
            District = record.District,
            Title = record.Title,
            Description = record.Description,
            ExistingPdfPath = record.PdfPath,
            ExistingPreviewPath = record.PreviewPath
        });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    [RequestFormLimits(MultipartBodyLengthLimit = 35 * 1024 * 1024)]
    public async Task<IActionResult> EditTraining(DistrictTrainingFormViewModel model, CancellationToken cancellationToken)
    {
        if (model.Id is null)
        {
            return BadRequest();
        }
        await ValidateTrainingAsync(model, false, cancellationToken);
        if (!ModelState.IsValid)
        {
            SetDistricts();
            return View("TrainingForm", model);
        }
        if (await trainingStore.UpdateAsync(model.Id.Value, model, cancellationToken) is null)
        {
            return NotFound();
        }
        TempData["Success"] = "The district training PDF was updated.";
        return RedirectToAction(nameof(Training));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteTraining(Guid id, CancellationToken cancellationToken)
    {
        if (!await trainingStore.DeleteAsync(id, cancellationToken))
        {
            return NotFound();
        }
        TempData["Success"] = "The district training record and its managed files were deleted.";
        return RedirectToAction(nameof(Training));
    }

    private int GetCurrentUserId() =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!, CultureInfo.InvariantCulture);

    private void ValidateRole(string role)
    {
        if (role is not CmsRoles.Admin and not CmsRoles.User)
        {
            ModelState.AddModelError(nameof(UserFormViewModel.Role), "Select a valid role.");
        }
    }

    private static NewsCardFormViewModel NewNewsForm()
    {
        var today = DateTime.Today.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        return new NewsCardFormViewModel
        {
            English = new NewsLanguageInput { PublishDate = today },
            Hindi = new NewsLanguageInput { PublishDate = today },
            Odia = new NewsLanguageInput { PublishDate = today }
        };
    }

    private async Task ValidateNewsPhotosAsync(
        IReadOnlyCollection<IFormFile> photos,
        int retainedPhotoCount,
        CancellationToken cancellationToken)
    {
        var uploadedPhotos = photos.Where(photo => photo.Length > 0).ToList();
        var totalPhotoCount = retainedPhotoCount + uploadedPhotos.Count;
        if (totalPhotoCount == 0)
        {
            ModelState.AddModelError(nameof(NewsCardFormViewModel.Photos), "Add at least one WebP photo.");
        }
        if (totalPhotoCount > MaxNewsPhotos)
        {
            ModelState.AddModelError(
                nameof(NewsCardFormViewModel.Photos),
                $"A News Card can contain up to {MaxNewsPhotos} photos.");
        }
        foreach (var photo in uploadedPhotos)
        {
            var error = await files.ValidateWebpAsync(photo, false, cancellationToken);
            if (error is not null)
            {
                ModelState.AddModelError(nameof(NewsCardFormViewModel.Photos), $"{photo.FileName}: {error}");
            }
        }
    }

    private Dictionary<string, NewsCardTranslation> ParseTranslations(NewsCardFormViewModel model)
    {
        var result = new Dictionary<string, NewsCardTranslation>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in TranslationInputs(model))
        {
            if (!DateOnly.TryParseExact(
                    item.Input.PublishDate,
                    "dd/MM/yyyy",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out var publishDate))
            {
                ModelState.AddModelError($"{item.Property}.PublishDate", "Enter a valid date in DD/MM/YYYY format.");
            }
            result[item.Code] = new NewsCardTranslation
            {
                LanguageCode = item.Code,
                Title = item.Input.Title.Trim(),
                PublishDate = publishDate,
                ImagePath = "",
                TextNote = item.Input.TextNote.Trim(),
                Footer = item.Input.Footer.Trim()
            };
        }
        return result;
    }

    private static IEnumerable<(string Code, string Property, NewsLanguageInput Input)> TranslationInputs(
        NewsCardFormViewModel model)
    {
        yield return ("en", nameof(model.English), model.English);
        yield return ("hi", nameof(model.Hindi), model.Hindi);
        yield return ("or", nameof(model.Odia), model.Odia);
    }

    private static NewsCardFormViewModel ToForm(NewsCard card)
    {
        NewsLanguageInput Map(string code)
        {
            var value = card.Translations[code];
            return new NewsLanguageInput
            {
                Title = value.Title,
                PublishDate = value.PublishDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
                TextNote = value.TextNote,
                Footer = value.Footer
            };
        }
        return new NewsCardFormViewModel
        {
            Id = card.Id,
            IsPublished = card.Status == "Published",
            ExistingPhotoPaths = ExistingNewsPaths(card),
            English = Map("en"),
            Hindi = Map("hi"),
            Odia = Map("or")
        };
    }

    private static List<string> ExistingNewsPaths(NewsCard card)
    {
        var paths = card.ImagePaths
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (paths.Count > 0)
        {
            return paths;
        }
        return card.Translations.Values
            .Select(translation => translation.ImagePath)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private async Task ValidateTrainingAsync(
        DistrictTrainingFormViewModel model,
        bool required,
        CancellationToken cancellationToken)
    {
        if (!Districts.Contains(model.District))
        {
            ModelState.AddModelError(nameof(model.District), "Select a valid Odisha district.");
        }
        var pdfError = await files.ValidatePdfAsync(model.PdfFile, required, cancellationToken);
        if (pdfError is not null)
        {
            ModelState.AddModelError(nameof(model.PdfFile), pdfError);
        }
        var previewError = await files.ValidateWebpAsync(model.PreviewImage, required, cancellationToken);
        if (previewError is not null)
        {
            ModelState.AddModelError(nameof(model.PreviewImage), previewError);
        }
    }

    private void SetDistricts() => ViewBag.Districts = Districts;
}
