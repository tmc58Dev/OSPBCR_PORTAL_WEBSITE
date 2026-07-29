using Microsoft.Data.SqlClient;

namespace OSPBCR_PORTAL.Data;

public abstract class SqlConnectionFactory : ISqlConnectionFactory
{
    private readonly string _connectionString;

    protected SqlConnectionFactory(
        IConfiguration configuration,
        string connectionName,
        params string[] environmentVariableNames)
    {
        _connectionString = environmentVariableNames
            .Select(Environment.GetEnvironmentVariable)
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))
            ?? configuration.GetConnectionString(connectionName)
            ?? throw new InvalidOperationException(
                $"Database connection string is missing. Configure ConnectionStrings:{connectionName}.");
    }

    public async Task<SqlConnection> OpenConnectionAsync(CancellationToken cancellationToken = default)
    {
        var connection = new SqlConnection(_connectionString);

        try
        {
            await connection.OpenAsync(cancellationToken);
            return connection;
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }
}

public sealed class SetuOdishaSqlConnectionFactory(IConfiguration configuration)
    : SqlConnectionFactory(
        configuration,
        "Setu_Odisha",
        "OSPBCR_SETU_ODISHA_CONNECTION",
        "OSPBCR_DATABASE_CONNECTION"),
      ISetuOdishaConnectionFactory;

public sealed class OspbcrPortalSqlConnectionFactory(IConfiguration configuration)
    : SqlConnectionFactory(
        configuration,
        "OSPBCR_PORTAL",
        "OSPBCR_PORTAL_DATABASE_CONNECTION"),
      IOspbcrPortalConnectionFactory;
