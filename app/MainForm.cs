using System.Diagnostics;
using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MaliyetHesaplamaAraci;

public class MainForm : Form
{
    private const string VirtualHost = "app.local";

    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(12) };

    public MainForm()
    {
        Text = "Maliyet Hesaplama";
        Width = 1440;
        Height = 900;
        MinimumSize = new Size(900, 600);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = ColorTranslator.FromHtml("#f1f3f6");

        Controls.Add(_webView);
        Load += MainForm_Load;
    }

    private async void MainForm_Load(object? sender, EventArgs e)
    {
        try
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var rootDir = Path.Combine(appData, "MaliyetHesaplamaAraci");
            var webRootDir = Path.Combine(rootDir, "web");
            var userDataDir = Path.Combine(rootDir, "WebView2");
            Directory.CreateDirectory(webRootDir);
            Directory.CreateDirectory(userDataDir);

            ExtractEmbeddedWebRoot(webRootDir);

            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataDir);
            await _webView.EnsureCoreWebView2Async(environment);

            var settings = _webView.CoreWebView2.Settings;
            settings.AreDefaultContextMenusEnabled = false;
            settings.IsStatusBarEnabled = false;

            _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                VirtualHost, webRootDir, CoreWebView2HostResourceAccessKind.Allow);
            _webView.CoreWebView2.Navigate($"https://{VirtualHost}/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                this,
                "Bu uygulamanın çalışması için Microsoft Edge WebView2 Runtime gereklidir.\n\n" +
                "Çoğu Windows 10/11 bilgisayarında bu zaten yüklüdür. Yüklü değilse " +
                "\"Microsoft Edge WebView2 Runtime\" aramasıyla Microsoft'un resmi sitesinden " +
                "ücretsiz indirip kurabilir, ardından bu programı tekrar açabilirsiniz.",
                "WebView2 Runtime bulunamadı",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            Close();
        }
    }

    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string raw;
        try { raw = e.TryGetWebMessageAsString(); }
        catch { return; }

        Dictionary<string, object?> result;
        try
        {
            using var request = JsonDocument.Parse(raw);
            var root = request.RootElement;
            if (!root.TryGetProperty("type", out var typeProperty)) return;

            result = typeProperty.GetString() switch
            {
                "fetchRates" => await HandleFetchRatesAsync(root),
                "backup" => HandleBackup(root),
                "savePdf" => await HandleSavePdfAsync(root),
                "openPath" => HandleOpenPath(root),
                _ => new Dictionary<string, object?>(),
            };
        }
        catch { return; }

        if (result.Count == 0) return;
        if (IsDisposed || _webView.IsDisposed) return;
        _webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(result));
    }

    private const int KeepBackups = 14;

    private static string BackupDirectory() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        "Maliyet Hesaplama", "Yedekler");

    private static Dictionary<string, object?> HandleBackup(JsonElement request)
    {
        var result = new Dictionary<string, object?> { ["type"] = "backup" };
        result["manual"] = request.TryGetProperty("manual", out var m) && m.ValueKind == JsonValueKind.True;

        try
        {
            if (!request.TryGetProperty("json", out var payload) || payload.ValueKind != JsonValueKind.String)
            {
                result["ok"] = false;
                result["error"] = "Yedeklenecek veri bulunamadı.";
                return result;
            }

            var directory = BackupDirectory();
            Directory.CreateDirectory(directory);
            var path = Path.Combine(directory, $"maliyet-{DateTime.Now:yyyy-MM-dd}.json");
            File.WriteAllText(path, payload.GetString() ?? "", new UTF8Encoding(false));

            PruneBackups(directory);

            result["ok"] = true;
            result["path"] = path;
            result["date"] = DateTime.Now.ToString("yyyy-MM-dd");
        }
        catch (Exception ex)
        {
            result["ok"] = false;
            result["error"] = ex.Message;
        }
        return result;
    }

    private static void PruneBackups(string directory)
    {
        try
        {
            var stale = new DirectoryInfo(directory)
                .GetFiles("maliyet-*.json")
                .OrderByDescending(f => f.Name, StringComparer.Ordinal)
                .Skip(KeepBackups);
            foreach (var file in stale)
            {
                try { file.Delete(); } catch { }
            }
        }
        catch { }
    }

    private static string ReportDirectory() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        "Maliyet Hesaplama", "Raporlar");

    private async Task<Dictionary<string, object?>> HandleSavePdfAsync(JsonElement request)
    {
        var result = new Dictionary<string, object?> { ["type"] = "pdf" };
        try
        {
            var directory = ReportDirectory();
            Directory.CreateDirectory(directory);

            var name = request.TryGetProperty("name", out var n) ? n.GetString() : null;
            var path = Path.Combine(directory, $"{SafeFileName(name)}-{DateTime.Now:yyyy-MM-dd}.pdf");

            var settings = _webView.CoreWebView2.Environment.CreatePrintSettings();
            settings.ShouldPrintBackgrounds = true;
            settings.Orientation =
                request.TryGetProperty("orientation", out var o) && o.GetString() == "landscape"
                    ? CoreWebView2PrintOrientation.Landscape
                    : CoreWebView2PrintOrientation.Portrait;

            var ok = await _webView.CoreWebView2.PrintToPdfAsync(path, settings);
            if (!ok)
            {
                result["ok"] = false;
                result["error"] = "PDF oluşturulamadı.";
                return result;
            }

            result["ok"] = true;
            result["path"] = path;
        }
        catch (Exception ex)
        {
            result["ok"] = false;
            result["error"] = ex.Message;
        }
        return result;
    }

    private static string SafeFileName(string? name)
    {
        var cleaned = string.Join("_", (name ?? "rapor").Split(Path.GetInvalidFileNameChars(),
            StringSplitOptions.RemoveEmptyEntries)).Trim().Trim('.');
        if (cleaned.Length == 0) cleaned = "rapor";
        return cleaned.Length > 60 ? cleaned[..60] : cleaned;
    }

    private static Dictionary<string, object?> HandleOpenPath(JsonElement request)
    {
        var result = new Dictionary<string, object?> { ["type"] = "openPath" };
        try
        {
            var what = request.TryGetProperty("what", out var w) ? w.GetString() : null;
            var directory = what switch
            {
                "reports" => ReportDirectory(),
                _ => BackupDirectory(),
            };
            Directory.CreateDirectory(directory);
            Process.Start(new ProcessStartInfo { FileName = directory, UseShellExecute = true });
            result["ok"] = true;
        }
        catch (Exception ex)
        {
            result["ok"] = false;
            result["error"] = ex.Message;
        }
        return result;
    }

    private static async Task<Dictionary<string, object?>> HandleFetchRatesAsync(JsonElement request)
    {
        var manual = !request.TryGetProperty("manual", out var m) || m.ValueKind == JsonValueKind.True;

        var result = await FetchRatesAsync();
        result["type"] = "rates";
        result["manual"] = manual;
        return result;
    }

    private static async Task<Dictionary<string, object?>> FetchRatesAsync()
    {
        try
        {
            var tcmb = await FetchFromTcmbAsync();
            if (tcmb is not null) return tcmb;
        }
        catch { }

        try
        {
            var ecb = await FetchFromFrankfurterAsync();
            if (ecb is not null) return ecb;
        }
        catch { }

        return new Dictionary<string, object?>
        {
            ["ok"] = false,
            ["error"] = "Kurlar alınamadı. İnternet bağlantısını kontrol edin veya elle girin.",
        };
    }

    private static async Task<Dictionary<string, object?>?> FetchFromTcmbAsync()
    {
        var xml = await Http.GetStringAsync("https://www.tcmb.gov.tr/kurlar/today.xml");
        var root = XDocument.Parse(xml).Root;
        if (root is null) return null;

        decimal? Rate(string code)
        {
            var node = root.Elements("Currency").FirstOrDefault(c => (string?)c.Attribute("Kod") == code);
            var text = node?.Element("ForexSelling")?.Value;
            return decimal.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var value) && value > 0
                ? value
                : null;
        }

        var usd = Rate("USD");
        var eur = Rate("EUR");
        if (usd is null || eur is null) return null;

        return new Dictionary<string, object?>
        {
            ["ok"] = true,
            ["usd"] = usd,
            ["eur"] = eur,
            ["date"] = (string?)root.Attribute("Tarih") ?? DateTime.Now.ToString("dd.MM.yyyy"),
            ["source"] = "TCMB döviz satış",
        };
    }

    private static async Task<Dictionary<string, object?>?> FetchFromFrankfurterAsync()
    {
        var json = await Http.GetStringAsync("https://api.frankfurter.app/latest?base=EUR&symbols=TRY,USD");
        using var parsed = JsonDocument.Parse(json);
        var rates = parsed.RootElement.GetProperty("rates");
        var eurTry = rates.GetProperty("TRY").GetDecimal();
        var eurUsd = rates.GetProperty("USD").GetDecimal();
        if (eurUsd <= 0) return null;

        return new Dictionary<string, object?>
        {
            ["ok"] = true,
            ["usd"] = Math.Round(eurTry / eurUsd, 4),
            ["eur"] = Math.Round(eurTry, 4),
            ["date"] = parsed.RootElement.GetProperty("date").GetString(),
            ["source"] = "ECB (frankfurter.app)",
        };
    }

    private static void ExtractEmbeddedWebRoot(string destinationDir)
    {
        var assembly = Assembly.GetExecutingAssembly();
        const string prefix = "webroot.";
        var written = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var resourceName in assembly.GetManifestResourceNames())
        {
            if (!resourceName.StartsWith(prefix, StringComparison.Ordinal)) continue;
            var relativeName = resourceName[prefix.Length..];
            var destPath = Path.Combine(destinationDir, relativeName);
            Directory.CreateDirectory(Path.GetDirectoryName(destPath)!);

            using var resourceStream = assembly.GetManifestResourceStream(resourceName);
            if (resourceStream is null) continue;
            using var fileStream = new FileStream(destPath, FileMode.Create, FileAccess.Write);
            resourceStream.CopyTo(fileStream);
            written.Add(Path.GetFullPath(destPath));
        }

        foreach (var existing in Directory.GetFiles(destinationDir, "*", SearchOption.AllDirectories))
        {
            if (written.Contains(Path.GetFullPath(existing))) continue;
            try { File.Delete(existing); } catch { }
        }
    }
}
