using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OSPBCR_PORTAL.Data;
using OSPBCR_PORTAL.Services;

namespace OSPBCR_PORTAL.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/content")]
public sealed class ContentController(
    ICmsRepository repository,
    IDistrictTrainingStore trainingStore,
    ILogger<ContentController> logger) : ControllerBase
{
    [HttpGet("news")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> News([FromQuery] string language = "en", CancellationToken cancellationToken = default)
    {
        language = language.ToLowerInvariant();
        language = language is "all" or "en" or "hi" or "or" ? language : "en";
        try
        {
            return Ok(await repository.GetPublishedNewsAsync(language, cancellationToken));
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Published News Cards could not be loaded.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "News Cards are temporarily unavailable." });
        }
    }

    [HttpGet("training-pdfs")]
    [ResponseCache(Duration = 30, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> TrainingPdfs(CancellationToken cancellationToken) =>
        Ok(await trainingStore.GetAllAsync(cancellationToken));
}
