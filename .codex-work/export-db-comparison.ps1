$ErrorActionPreference = 'Stop'
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'DbCompare\Program.cs') -Raw
$match = [regex]::Match($source, 'const string sql = """\r?\n(?<sql>[\s\S]*?)\r?\n""";')
if (-not $match.Success) { throw 'SQL block was not found.' }

$connection = New-Object System.Data.SqlClient.SqlConnection 'Server=.;Database=master;User ID=sa;Password=db853;Encrypt=False;TrustServerCertificate=True'
$connection.Open()
try {
    $command = $connection.CreateCommand()
    $command.CommandText = $match.Groups['sql'].Value
    $command.CommandTimeout = 300
    $reader = $command.ExecuteReader()
    $names = @('schema.csv', 'counts.csv', 'comparison.csv')
    $index = 0
    while (-not $reader.IsClosed) {
        $table = New-Object System.Data.DataTable
        $table.Load($reader)
        $path = Join-Path $PSScriptRoot $names[$index]
        $table | Export-Csv -LiteralPath $path -NoTypeInformation -Encoding utf8
        Write-Output "$($names[$index]): $($table.Rows.Count) rows"
        $index++
    }
} finally {
    $connection.Close()
}
