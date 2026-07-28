using System.Text.Json;
using OSPBCR_PORTAL.Models;

namespace OSPBCR_PORTAL.Services;

public sealed class DistrictTrainingStore(
    IWebHostEnvironment environment,
    IManagedFileStorage files) : IDistrictTrainingStore
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly string _dataPath = Path.Combine(environment.ContentRootPath, "App_Data", "district-training-pdfs.json");
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public async Task<IReadOnlyList<DistrictTrainingRecord>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            return (await LoadUnsafeAsync(cancellationToken))
                .OrderBy(record => record.District)
                .ThenBy(record => record.Title)
                .ToList();
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<DistrictTrainingRecord?> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            return (await LoadUnsafeAsync(cancellationToken)).SingleOrDefault(record => record.Id == id);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<DistrictTrainingRecord> CreateAsync(
        DistrictTrainingFormViewModel form,
        CancellationToken cancellationToken = default)
    {
        var pdfPath = await files.SavePdfAsync(form.PdfFile!, "training", cancellationToken);
        string? previewPath = null;
        try
        {
            previewPath = await files.SaveWebpAsync(form.PreviewImage!, "training", cancellationToken);
            var now = DateTimeOffset.Now;
            var record = new DistrictTrainingRecord
            {
                Id = Guid.NewGuid(),
                District = form.District.Trim(),
                Title = form.Title.Trim(),
                Description = form.Description.Trim(),
                PdfPath = pdfPath,
                PreviewPath = previewPath,
                CreatedAt = now,
                UpdatedAt = now
            };

            await _gate.WaitAsync(cancellationToken);
            try
            {
                var records = await LoadUnsafeAsync(cancellationToken);
                records.Add(record);
                await SaveUnsafeAsync(records, cancellationToken);
            }
            finally
            {
                _gate.Release();
            }
            return record;
        }
        catch
        {
            await files.DeleteIfManagedAsync(pdfPath, cancellationToken);
            await files.DeleteIfManagedAsync(previewPath, cancellationToken);
            throw;
        }
    }

    public async Task<DistrictTrainingRecord?> UpdateAsync(
        Guid id,
        DistrictTrainingFormViewModel form,
        CancellationToken cancellationToken = default)
    {
        string? newPdfPath = null;
        string? newPreviewPath = null;
        try
        {
            if (form.PdfFile is { Length: > 0 })
            {
                newPdfPath = await files.SavePdfAsync(form.PdfFile, "training", cancellationToken);
            }
            if (form.PreviewImage is { Length: > 0 })
            {
                newPreviewPath = await files.SaveWebpAsync(form.PreviewImage, "training", cancellationToken);
            }

            await _gate.WaitAsync(cancellationToken);
            DistrictTrainingRecord? record;
            string? oldPdfPath = null;
            string? oldPreviewPath = null;
            try
            {
                var records = await LoadUnsafeAsync(cancellationToken);
                record = records.SingleOrDefault(item => item.Id == id);
                if (record is null)
                {
                    return null;
                }
                oldPdfPath = record.PdfPath;
                oldPreviewPath = record.PreviewPath;
                record.District = form.District.Trim();
                record.Title = form.Title.Trim();
                record.Description = form.Description.Trim();
                record.PdfPath = newPdfPath ?? record.PdfPath;
                record.PreviewPath = newPreviewPath ?? record.PreviewPath;
                record.UpdatedAt = DateTimeOffset.Now;
                await SaveUnsafeAsync(records, cancellationToken);
            }
            finally
            {
                _gate.Release();
            }

            if (newPdfPath is not null)
            {
                await files.DeleteIfManagedAsync(oldPdfPath, cancellationToken);
            }
            if (newPreviewPath is not null)
            {
                await files.DeleteIfManagedAsync(oldPreviewPath, cancellationToken);
            }
            return record;
        }
        catch
        {
            await files.DeleteIfManagedAsync(newPdfPath, cancellationToken);
            await files.DeleteIfManagedAsync(newPreviewPath, cancellationToken);
            throw;
        }
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        DistrictTrainingRecord? record;
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var records = await LoadUnsafeAsync(cancellationToken);
            record = records.SingleOrDefault(item => item.Id == id);
            if (record is null)
            {
                return false;
            }
            records.Remove(record);
            await SaveUnsafeAsync(records, cancellationToken);
        }
        finally
        {
            _gate.Release();
        }
        await files.DeleteIfManagedAsync(record.PdfPath, cancellationToken);
        await files.DeleteIfManagedAsync(record.PreviewPath, cancellationToken);
        return true;
    }

    private async Task<List<DistrictTrainingRecord>> LoadUnsafeAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_dataPath))
        {
            return SeedRecords();
        }
        await using var stream = File.OpenRead(_dataPath);
        return await JsonSerializer.DeserializeAsync<List<DistrictTrainingRecord>>(stream, _jsonOptions, cancellationToken)
            ?? [];
    }

    private async Task SaveUnsafeAsync(List<DistrictTrainingRecord> records, CancellationToken cancellationToken)
    {
        var directory = Path.GetDirectoryName(_dataPath)!;
        Directory.CreateDirectory(directory);
        var temporaryPath = _dataPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        await using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
        {
            await JsonSerializer.SerializeAsync(stream, records, _jsonOptions, cancellationToken);
        }
        File.Move(temporaryPath, _dataPath, true);
    }

    private static List<DistrictTrainingRecord> SeedRecords()
    {
        var now = DateTimeOffset.Parse("2026-05-08T00:00:00+05:30");
        const string pdfRoot = "/assets/IMAGES_PDF_PPT_EXCEL/TRAININGS PAGE/DISTRICT/TRAINING PDFS/DISTRICT WISE TRAINING PDF/";
        const string previewRoot = "/assets/IMAGES_PDF_PPT_EXCEL/TRAININGS PAGE/DISTRICT/DISTRICT PDF PREVIEW IMAGE/";
        return
        [
            Seed("c908154d-9dcc-4025-b7a0-55cd2b1e2001", "Jagatsinghpur", "Cancer Registry Training Program Report",
                "Jagatsinghpur district in-person training PDF record.",
                pdfRoot + "Report of Cancer Registry Training Program , Jagatsinghpur (08.05.2026).pdf",
                previewRoot + "Report of Cancer Registry Training Program , Jagatsinghpur (08.05.2026) Preview_page_1.webp", now),
            Seed("c908154d-9dcc-4025-b7a0-55cd2b1e2002", "Koraput", "Cancer Registry Training",
                "Koraput district in-person training PDF record.",
                pdfRoot + "Cancer Registry Training at Koraput District.pdf",
                previewRoot + "Cancer Registry Training at Koraput District Preview_page_1.webp", now),
            Seed("c908154d-9dcc-4025-b7a0-55cd2b1e2003", "Malkangiri", "Cancer Registry Training",
                "Malkangiri district in-person training PDF record.",
                pdfRoot + "Cancer Registry Training at Malkangiri District.pdf",
                previewRoot + "Cancer Registry Training at Malkangiri District Preview_page_1.webp", now),
            Seed("c908154d-9dcc-4025-b7a0-55cd2b1e2004", "Mayurbhanj", "Population Based Cancer Registry Odisha",
                "Mayurbhanj district in-person training PDF record.",
                pdfRoot + "Population Based Cancer Registry Odisha Mayurbhanj.pdf",
                previewRoot + "Population Based Cancer Registry Odisha Mayurbhanj Preview_page_1.webp", now),
            Seed("c908154d-9dcc-4025-b7a0-55cd2b1e2005", "Nayagarh", "PBCR Odisha Report",
                "Nayagarh district in-person training PDF record.",
                pdfRoot + "PBCR Odisha Report Nayagarh District.pdf",
                previewRoot + "PBCR Odisha Report Nayagarh District Preview_page_1.webp", now),
            Seed("c908154d-9dcc-4025-b7a0-55cd2b1e2006", "Puri", "Population Based Cancer Registry Odisha",
                "Puri district in-person training PDF record.",
                pdfRoot + "Population Based Cancer Registry Odisha - Puri District.pdf",
                previewRoot + "Population Based Cancer Registry Odisha - Puri District preview_page_1.webp", now)
        ];
    }

    private static DistrictTrainingRecord Seed(
        string id,
        string district,
        string title,
        string description,
        string pdf,
        string preview,
        DateTimeOffset timestamp) => new()
        {
            Id = Guid.Parse(id),
            District = district,
            Title = title,
            Description = description,
            PdfPath = pdf,
            PreviewPath = preview,
            CreatedAt = timestamp,
            UpdatedAt = timestamp
        };
}
