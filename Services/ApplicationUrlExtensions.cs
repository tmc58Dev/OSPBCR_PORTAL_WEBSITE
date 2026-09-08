using Microsoft.AspNetCore.Mvc;

namespace OSPBCR_PORTAL.Services;

public static class ApplicationUrlExtensions
{
    public static string ApplicationContent(this IUrlHelper url, string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return path ?? string.Empty;
        if (path.StartsWith("~/", StringComparison.Ordinal)) return url.Content(path);
        if (path.StartsWith("//", StringComparison.Ordinal) ||
            Uri.TryCreate(path, UriKind.Absolute, out var absolute) && !absolute.IsFile)
            return path;

        var pathBase = url.ActionContext.HttpContext.Request.PathBase.Value;
        if (!string.IsNullOrEmpty(pathBase) &&
            (path.Equals(pathBase, StringComparison.OrdinalIgnoreCase) ||
             path.StartsWith(pathBase + "/", StringComparison.OrdinalIgnoreCase)))
            return path;

        return url.Content("~/" + path.TrimStart('/'));
    }
}
