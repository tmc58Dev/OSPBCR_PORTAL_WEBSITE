using Microsoft.Data.SqlClient;

namespace OSPBCR_PORTAL.Data;

public interface ISqlConnectionFactory
{
    Task<SqlConnection> OpenConnectionAsync(CancellationToken cancellationToken = default);
}

public interface ISetuOdishaConnectionFactory : ISqlConnectionFactory;

public interface IOspbcrPortalConnectionFactory : ISqlConnectionFactory;
