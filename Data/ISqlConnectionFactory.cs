using Microsoft.Data.SqlClient;

namespace OSPBCR_PORTAL.Data;

public interface ISqlConnectionFactory
{
    Task<SqlConnection> OpenConnectionAsync(CancellationToken cancellationToken = default);
}
