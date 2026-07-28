using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using OSPBCR_PORTAL.Data;
using OSPBCR_PORTAL.Models;
using OSPBCR_PORTAL.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();
builder.Services.AddScoped<ISqlConnectionFactory, SqlConnectionFactory>();
builder.Services.AddScoped<IRegistryDataService, RegistryDataService>();
builder.Services.AddScoped<ICmsRepository, CmsRepository>();
builder.Services.AddSingleton<IPasswordHasher<CmsUser>, PasswordHasher<CmsUser>>();
builder.Services.AddSingleton<IManagedFileStorage, ManagedFileStorage>();
builder.Services.AddSingleton<IDistrictTrainingStore, DistrictTrainingStore>();
builder.Services.AddHostedService<CmsDatabaseInitializer>();

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 525L * 1024 * 1024;
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

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

var contentTypeProvider = new FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".geojson"] = "application/geo+json";

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = contentTypeProvider
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

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => Results.Redirect("/home.html"))
    .AllowAnonymous();

app.MapGet("/trending", () => Results.Redirect("/trending.html?dateOrder=desc&view=20260726-auto-image-slider"))
    .AllowAnonymous();

app.MapStaticAssets();
app.MapControllers();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();


app.Run();
