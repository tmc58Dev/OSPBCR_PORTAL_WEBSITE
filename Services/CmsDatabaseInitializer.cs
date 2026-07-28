using OSPBCR_PORTAL.Data;

namespace OSPBCR_PORTAL.Services;

public sealed class CmsDatabaseInitializer(
    IServiceScopeFactory scopeFactory,
    ILogger<CmsDatabaseInitializer> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var repository = scope.ServiceProvider.GetRequiredService<ICmsRepository>();
            await repository.InitializeAsync(cancellationToken);
            logger.LogInformation("CMS database schema is ready.");
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "CMS database initialization failed. Public static pages will remain available.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
