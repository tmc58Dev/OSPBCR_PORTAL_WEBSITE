using System.IO.Compression;

if (args.Length < 2)
{
    Console.Error.WriteLine("Usage: unzip -Z1 archive | unzip -p archive entry");
    return 2;
}

var mode = args[0];
var archivePath = args[1];

using var archive = ZipFile.OpenRead(archivePath);

if (mode == "-Z1")
{
    foreach (var entry in archive.Entries)
    {
        Console.WriteLine(entry.FullName);
    }
    return 0;
}

if (mode == "-p" && args.Length >= 3)
{
    var entry = archive.GetEntry(args[2]);
    if (entry is null)
    {
        Console.Error.WriteLine($"Missing archive entry: {args[2]}");
        return 11;
    }
    await using var input = entry.Open();
    await using var output = Console.OpenStandardOutput();
    await input.CopyToAsync(output);
    return 0;
}

Console.Error.WriteLine("Unsupported unzip arguments");
return 2;
