using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OSPBCR_PORTAL.Models;
using System.Diagnostics;

namespace OSPBCR_PORTAL.Controllers
{
    public class HomeController : Controller
    {
        [AllowAnonymous]
        public IActionResult Index()
        {
            return Redirect("~/home.html");
        }

        public IActionResult Privacy()
        {
            return View();
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
