using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using OSPBCR_PORTAL.Data;
using OSPBCR_PORTAL.Models;
using OSPBCR_PORTAL.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();
builder.Services.AddScoped<ISetuOdishaConnectionFactory, SetuOdishaSqlConnectionFactory>();
builder.Services.AddScoped<IOspbcrPortalConnectionFactory, OspbcrPortalSqlConnectionFactory>();
builder.Services.AddScoped<IRegistryDataService, RegistryDataService>();
builder.Services.AddScoped<ICmsRepository, CmsRepository>();
builder.Services.Configure<CmsAssetStorageOptions>(
    builder.Configuration.GetSection(CmsAssetStorageOptions.SectionName));
builder.Services.AddSingleton<IPasswordHasher<CmsUser>, PasswordHasher<CmsUser>>();
builder.Services.AddSingleton<IManagedFileStorage, ManagedFileStorage>();
builder.Services.AddSingleton<IRichTextSanitizer, RichTextSanitizer>();
builder.Services.AddHostedService<CmsDatabaseInitializer>();

builder.Services.Configure<FormOptions>(options =>
{
    // A CMS field may contain up to 9,999,999 Unicode characters. Allow for the
    // largest UTF-8 representation while the model validators enforce the exact
    // character limit.
    options.ValueLengthLimit = NewsLanguageInput.MaxContentLength * 4;
    // Leave room for an 853 MB PDF, its preview image, form fields, and multipart overhead.
    options.MultipartBodyLengthLimit = 1024L * 1024 * 1024;
});

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Account/Login";
        options.AccessDeniedPath = "/Account/AccessDenied";
        options.Cookie.Name = "OSPBCR.Cms";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
    });

builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{ 
    options.AddFixedWindowLimiter("login", limiter =>
    {
        limiter.PermitLimit = 10;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
        limiter.AutoReplenishment = true;
    });
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});
builder.Services.AddRazorPages();

var app = builder.Build();

var publicPages = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
{
    ["/about"] = "about.html",
    ["/cancer-burden"] = "cancer-burden.html",
    ["/data-sources"] = "data-sources.html",
    ["/map"] = "map.html",
    ["/news-detail"] = "news-detail.html",
    ["/participants"] = "participants.html",
    ["/population-projection"] = "population-projection.html",
    ["/team"] = "team.html",
    ["/training-materials"] = "training-materials.html",
    ["/trainings"] = "trainings.html",
    ["/trending"] = "trending.html"
};

var legacyPageRedirects = publicPages
    .ToDictionary(
        page => "/" + page.Value,
        page => page.Key,
        StringComparer.OrdinalIgnoreCase);
legacyPageRedirects["/index.html"] = "/";
legacyPageRedirects["/home.html"] = "/";

// IIS supplies PathBase for a sub-application. The configured value also supports
// reverse proxies that preserve or strip the public /ospbcr prefix.
var configuredPathBase = builder.Configuration["PathBase"]?.TrimEnd('/');
if (!string.IsNullOrEmpty(configuredPathBase))
{
    app.UsePathBase(configuredPathBase);
    app.Use(async (context, next) =>
    {
        if (!context.Request.PathBase.HasValue)
        {
            context.Request.PathBase = configuredPathBase;
        }
        await next(context);
    });
}


// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

// Keep the HTML files as the implementation detail while exposing stable,
// extensionless public URLs. Query strings pass through both redirects and
// internal rewrites unchanged.
app.Use(async (context, next) =>
{
    if (!context.Request.Path.HasValue && context.Request.PathBase.HasValue)
    {
        var homepage = $"{context.Request.PathBase}/{context.Request.QueryString}";
        context.Response.Redirect(homepage, permanent: true, preserveMethod: true);
        return;
    }

    var requestPath = context.Request.Path.HasValue ? context.Request.Path.Value! : "/";

    if (legacyPageRedirects.TryGetValue(requestPath, out var cleanPath))
    {
        var destination = $"{context.Request.PathBase}{cleanPath}{context.Request.QueryString}";
        context.Response.Redirect(destination, permanent: true, preserveMethod: true);
        return;
    }

    if ((HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method)) &&
        publicPages.TryGetValue(requestPath, out var pageFile))
    {
        context.Request.Path = "/" + pageFile;
    }

    await next(context);
});

var contentTypeProvider = new FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".geojson"] = "application/geo+json";

// Village geometry is intentionally not published. Keep this deny rule ahead
// of static-file middleware as defense in depth if a stale file is ever copied
// into wwwroot by a deployment or maintenance process.
app.Use(async (context, next) =>
{
    var requestPath = (context.Request.Path.Value ?? string.Empty)
        .Replace("%20", " ", StringComparison.OrdinalIgnoreCase);
    var isVillageGeometryRequest = requestPath.StartsWith(
        "/assets/data/nhm-gis/village",
        StringComparison.OrdinalIgnoreCase);
    var isRawVillageSourceRequest = requestPath.Contains(
        "/GIS files NHM/village layer",
        StringComparison.OrdinalIgnoreCase);
    var isRawGisArchiveRequest = requestPath.EndsWith(
        "/GIS files NHM.rar",
        StringComparison.OrdinalIgnoreCase);

    if (isVillageGeometryRequest || isRawVillageSourceRequest || isRawGisArchiveRequest)
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    await next(context);
});

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = contentTypeProvider
});

var cmsAssetOptions = app.Services.GetRequiredService<IOptions<CmsAssetStorageOptions>>().Value;
var cmsAssetRoot = Path.GetFullPath(
    Environment.ExpandEnvironmentVariables(cmsAssetOptions.RootPath.Trim()));
Directory.CreateDirectory(cmsAssetRoot);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(cmsAssetRoot),
    RequestPath = "/" + cmsAssetOptions.RequestPath.Trim('/'),
    ContentTypeProvider = contentTypeProvider,
    ServeUnknownFileTypes = false,
    OnPrepareResponse = context =>
    {
        context.Context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    }
});

var homeViewsPath = Path.Combine(app.Environment.ContentRootPath, "Views", "Home");
if (Directory.Exists(homeViewsPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(homeViewsPath),
        OnPrepareResponse = context =>
        {
            context.Context.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
            context.Context.Response.Headers["Pragma"] = "no-cache";
            context.Context.Response.Headers["Expires"] = "0";
        }
    });
}

var sharedViewsPath = Path.Combine(app.Environment.ContentRootPath, "Views", "Shared");
if (Directory.Exists(sharedViewsPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(sharedViewsPath),
        RequestPath = "/components"
    });
}

app.UseRouting();

app.Use(async (context, next) =>
{
    try
    {
        await next(context);
    }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
    {
        app.Logger.LogDebug(
            "Request {Method} {Path} was canceled by the client.",
            context.Request.Method,
            context.Request.Path);

        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = 499;
        }
    }
});

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", async (HttpContext context) =>
{
    context.Response.ContentType = "text/html";
    context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
    context.Response.Headers.Pragma = "no-cache";
    context.Response.Headers.Expires = "0";
    await context.Response.SendFileAsync(Path.Combine(homeViewsPath, "home.html"));
}).AllowAnonymous();

app.MapGet("/sitemap.xml", (HttpContext context) =>
{
    string[] indexedPaths =
    [
        "/", "/about", "/cancer-burden", "/data-sources", "/map",
        "/population-projection", "/team", "/training-materials", "/trainings", "/trending"
    ];
    var siteRoot = $"{context.Request.Scheme}://{context.Request.Host}{context.Request.PathBase}";
    var urls = string.Join(
        Environment.NewLine,
        indexedPaths.Select(path => $"  <url><loc>{System.Net.WebUtility.HtmlEncode(siteRoot + path)}</loc></url>"));
    var sitemap = $"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
                  $"<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n{urls}\n</urlset>";
    return Results.Text(sitemap, "application/xml");
}).AllowAnonymous();

app.MapGet("/robots.txt", (HttpContext context) =>
{
    var sitemapUrl = $"{context.Request.Scheme}://{context.Request.Host}{context.Request.PathBase}/sitemap.xml";
    return Results.Text($"User-agent: *\nAllow: /\nSitemap: {sitemapUrl}\n", "text/plain");
}).AllowAnonymous();

app.MapStaticAssets();
app.MapControllers();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.Run();
