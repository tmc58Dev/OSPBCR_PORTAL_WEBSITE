using Microsoft.Data.SqlClient;

namespace OSPBCR_PORTAL.Data;

public sealed class SqlConnectionFactory(IConfiguration configuration) : ISqlConnectionFactory
{
    private readonly string _connectionString =
        Environment.GetEnvironmentVariable("OSPBCR_DATABASE_CONNECTION")
        ?? configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException(
            "Database connection string is missing. Configure ConnectionStrings:DefaultConnection or OSPBCR_DATABASE_CONNECTION.");

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
