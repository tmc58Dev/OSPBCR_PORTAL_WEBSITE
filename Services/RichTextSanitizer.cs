using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;

namespace OSPBCR_PORTAL.Services;

public interface IRichTextSanitizer
{
    string Sanitize(string? html);
}

public sealed partial class RichTextSanitizer : IRichTextSanitizer
{
    private static readonly HashSet<string> AllowedElements = new(StringComparer.OrdinalIgnoreCase)
    {
        "a", "abbr", "address", "article", "b", "big", "blockquote", "br", "caption", "cite", "code",
        "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure", "font", "footer", "h1", "h2",
        "h3", "h4", "h5", "h6", "header", "hr", "i", "ins", "kbd", "li", "main", "mark", "nav",
        "ol", "p", "pre", "q", "s", "samp", "section", "small", "span", "strike", "strong", "sub",
        "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var"
    };

    private static readonly HashSet<string> RemoveWithContents = new(StringComparer.OrdinalIgnoreCase)
    {
        "applet", "base", "button", "embed", "form", "frame", "frameset", "iframe", "input", "link",
        "math", "meta", "object", "script", "select", "style", "svg", "textarea", "xml"
    };

    private static readonly HashSet<string> AllowedStyles = new(StringComparer.OrdinalIgnoreCase)
    {
        "background-color", "border", "border-bottom", "border-collapse", "border-left", "border-right",
        "border-top", "color", "font-family", "font-size", "font-style", "font-variant", "font-weight",
        "letter-spacing", "line-height", "list-style-position", "list-style-type", "margin-bottom",
        "margin-left", "margin-right", "margin-top", "padding-left", "padding-right", "text-align",
        "tab-size", "text-decoration", "text-decoration-line", "text-indent", "text-transform", "vertical-align",
        "white-space", "word-break", "word-spacing"
    };

    public string Sanitize(string? html)
    {
        if (string.IsNullOrEmpty(html)) return string.Empty;
        var source = NullCharacter().Replace(html, string.Empty);
        if (!source.Contains('<')) return HtmlEncoder.Default.Encode(source);

        source = HtmlVoidElement().Replace(source, match =>
            match.Value.EndsWith("/>", StringComparison.Ordinal) ? match.Value : $"<{match.Groups[1].Value}{match.Groups[2].Value} />");
        source = source.Replace("&nbsp;", "&#160;", StringComparison.OrdinalIgnoreCase);

        try
        {
            using var stringReader = new StringReader($"<root>{source}</root>");
            using var reader = XmlReader.Create(stringReader, new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null
            });
            var document = XDocument.Load(reader, LoadOptions.PreserveWhitespace);
            var root = document.Root!;
            foreach (var element in root.Descendants().ToList()) SanitizeElement(element);
            return string.Concat(root.Nodes().Select(node => node.ToString(SaveOptions.DisableFormatting)));
        }
        catch (XmlException)
        {
            // A direct or malformed request must never place unparsed markup in storage.
            return HtmlEncoder.Default.Encode(StripTags().Replace(source, " "));
        }
    }

    private static void SanitizeElement(XElement element)
    {
        var name = element.Name.LocalName.ToLowerInvariant();
        if (RemoveWithContents.Contains(name))
        {
            element.Remove();
            return;
        }
        if (!AllowedElements.Contains(name))
        {
            element.ReplaceWith(element.Nodes());
            return;
        }

        var attributes = element.Attributes().ToDictionary(
            attribute => attribute.Name.LocalName.ToLowerInvariant(),
            attribute => attribute.Value,
            StringComparer.OrdinalIgnoreCase);
        element.RemoveAttributes();

        var style = CleanStyle(attributes.GetValueOrDefault("style"), name);
        if (style.Length > 0) element.SetAttributeValue("style", style);
        if (attributes.TryGetValue("align", out var align) && Alignment().IsMatch(align))
            AppendStyle(element, $"text-align: {align.ToLowerInvariant()}");
        if (attributes.TryGetValue("dir", out var direction) && Direction().IsMatch(direction)) element.SetAttributeValue("dir", direction);
        if (attributes.TryGetValue("lang", out var language) && Language().IsMatch(language)) element.SetAttributeValue("lang", language);

        if (name == "a" && attributes.TryGetValue("href", out var href) && IsSafeLink(href))
        {
            element.SetAttributeValue("href", href.Trim());
            element.SetAttributeValue("target", "_blank");
            element.SetAttributeValue("rel", "noopener noreferrer");
        }
        if (name == "font")
        {
            if (attributes.TryGetValue("face", out var face) && FontFamily().IsMatch(face)) element.SetAttributeValue("face", face);
            if (attributes.TryGetValue("size", out var size) && FontSizeNumber().IsMatch(size)) element.SetAttributeValue("size", size);
            if (attributes.TryGetValue("color", out var color) && SafeColor().IsMatch(color)) element.SetAttributeValue("color", color);
        }
        if (name is "td" or "th")
        {
            if (attributes.TryGetValue("colspan", out var colspan) && SpanCount().IsMatch(colspan)) element.SetAttributeValue("colspan", colspan);
            if (attributes.TryGetValue("rowspan", out var rowspan) && SpanCount().IsMatch(rowspan)) element.SetAttributeValue("rowspan", rowspan);
        }
        if (name == "ol" && attributes.TryGetValue("start", out var start) && ListStart().IsMatch(start)) element.SetAttributeValue("start", start);
        if (name is "ol" or "ul" && attributes.TryGetValue("type", out var type) && ListType().IsMatch(type)) element.SetAttributeValue("type", type);
    }

    private static string CleanStyle(string? style, string elementName)
    {
        if (string.IsNullOrWhiteSpace(style) || UnsafeCss().IsMatch(style)) return string.Empty;
        var declarations = new List<string>();
        foreach (var declaration in style.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var separator = declaration.IndexOf(':');
            if (separator <= 0) continue;
            var property = declaration[..separator].Trim().ToLowerInvariant();
            var value = declaration[(separator + 1)..].Trim();
            if (!AllowedStyles.Contains(property) || !IsSafeStyleValue(property, value)) continue;
            declarations.Add($"{property}: {value}");
        }
        // Responsive table widths are safe; page/text-box widths on prose are not.
        if (elementName is "table" or "td" or "th")
        {
            var width = style.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(part => part.Split(':', 2, StringSplitOptions.TrimEntries))
                .FirstOrDefault(parts => parts.Length == 2 && parts[0].Equals("width", StringComparison.OrdinalIgnoreCase));
            if (width is { Length: 2 } && IsLength(width[1])) declarations.Add($"width: {width[1]}");
        }
        return string.Join("; ", declarations);
    }

    private static bool IsSafeStyleValue(string property, string value)
    {
        if (UnsafeCss().IsMatch(value)) return false;
        if (property is "color" or "background-color") return value.Length <= 80;
        if (property == "font-family") return value.Length <= 200 && !value.Contains(';');
        if (property == "font-size") return IsLength(value, 500) || CssFontSize().IsMatch(value);
        if (property == "font-weight") return FontWeight().IsMatch(value);
        if (property == "font-style") return FontStyle().IsMatch(value);
        if (property == "font-variant") return value is "normal" or "small-caps";
        if (property == "text-align") return Alignment().IsMatch(value);
        if (property is "text-decoration" or "text-decoration-line") return TextDecoration().IsMatch(value);
        if (property == "text-transform") return TextTransform().IsMatch(value);
        if (property == "line-height") return value == "normal" || decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out _) || IsLength(value, 500);
        if (property is "letter-spacing" or "word-spacing") return value == "normal" || IsLength(value);
        if (property.StartsWith("margin-") || property.StartsWith("padding-") || property == "text-indent") return value == "auto" || IsLength(value);
        if (property == "vertical-align") return VerticalAlign().IsMatch(value) || IsLength(value);
        if (property == "list-style-position") return value is "inside" or "outside";
        if (property == "list-style-type") return CssIdentifier().IsMatch(value);
        if (property == "border-collapse") return value is "collapse" or "separate";
        if (property == "white-space") return WhiteSpace().IsMatch(value);
        if (property == "word-break") return WordBreak().IsMatch(value);
        if (property == "tab-size") return TabSize().IsMatch(value) || IsLength(value);
        if (property.StartsWith("border", StringComparison.Ordinal)) return value.Length <= 100 && BorderValue().IsMatch(value);
        return false;
    }

    private static bool IsLength(string value, decimal percentMaximum = 100)
    {
        if (value == "0") return true;
        var match = CssLength().Match(value);
        if (!match.Success || !decimal.TryParse(match.Groups[1].Value, NumberStyles.Number, CultureInfo.InvariantCulture, out var amount)) return false;
        amount = Math.Abs(amount);
        return match.Groups[2].Value.ToLowerInvariant() switch
        {
            "%" => amount <= percentMaximum,
            "em" or "rem" or "ex" or "ch" => amount <= 40,
            "in" or "cm" => amount <= 20,
            "mm" => amount <= 200,
            _ => amount <= 1200
        };
    }

    private static bool IsSafeLink(string value) => SafeLink().IsMatch(value.Trim());
    private static void AppendStyle(XElement element, string declaration) =>
        element.SetAttributeValue("style", string.Join("; ", new[] { element.Attribute("style")?.Value, declaration }.Where(value => !string.IsNullOrWhiteSpace(value))));

    [GeneratedRegex("\\0")]
    private static partial Regex NullCharacter();
    [GeneratedRegex("<(br|hr)([^>]*)>", RegexOptions.IgnoreCase)]
    private static partial Regex HtmlVoidElement();
    [GeneratedRegex("<[^>]*>", RegexOptions.Singleline)]
    private static partial Regex StripTags();
    [GeneratedRegex("[{}<>\\x00-\\x1f]|url\\s*\\(|expression\\s*\\(|javascript:|@import|behavior\\s*:", RegexOptions.IgnoreCase)]
    private static partial Regex UnsafeCss();
    [GeneratedRegex("^(https?:|mailto:|tel:|/|#)", RegexOptions.IgnoreCase)]
    private static partial Regex SafeLink();
    [GeneratedRegex("^(start|end|left|center|right|justify)$", RegexOptions.IgnoreCase)]
    private static partial Regex Alignment();
    [GeneratedRegex("^(ltr|rtl|auto)$", RegexOptions.IgnoreCase)]
    private static partial Regex Direction();
    [GeneratedRegex("^[a-z]{2,3}(-[a-z0-9]{2,8})*$", RegexOptions.IgnoreCase)]
    private static partial Regex Language();
    [GeneratedRegex("^[\\w\\s,'\"-]+$")]
    private static partial Regex FontFamily();
    [GeneratedRegex("^[1-7]$")]
    private static partial Regex FontSizeNumber();
    [GeneratedRegex("^[#(),.%\\w\\s-]+$")]
    private static partial Regex SafeColor();
    [GeneratedRegex("^([1-9]|[1-9]\\d)$")]
    private static partial Regex SpanCount();
    [GeneratedRegex("^-?\\d{1,6}$")]
    private static partial Regex ListStart();
    [GeneratedRegex("^(1|a|A|i|I|disc|circle|square)$")]
    private static partial Regex ListType();
    [GeneratedRegex("^(-?\\d{1,4}(?:\\.\\d{1,3})?)(px|pt|pc|em|rem|ex|ch|cm|mm|in|%)$", RegexOptions.IgnoreCase)]
    private static partial Regex CssLength();
    [GeneratedRegex("^(xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)$", RegexOptions.IgnoreCase)]
    private static partial Regex CssFontSize();
    [GeneratedRegex("^(normal|bold|bolder|lighter|[1-9]00)$", RegexOptions.IgnoreCase)]
    private static partial Regex FontWeight();
    [GeneratedRegex("^(normal|italic|oblique(?:\\s+-?\\d{1,2}deg)?)$", RegexOptions.IgnoreCase)]
    private static partial Regex FontStyle();
    [GeneratedRegex("^(none|underline|overline|line-through)(\\s+(underline|overline|line-through))*$", RegexOptions.IgnoreCase)]
    private static partial Regex TextDecoration();
    [GeneratedRegex("^(none|capitalize|uppercase|lowercase)$", RegexOptions.IgnoreCase)]
    private static partial Regex TextTransform();
    [GeneratedRegex("^(baseline|sub|super|text-top|text-bottom|middle|top|bottom)$", RegexOptions.IgnoreCase)]
    private static partial Regex VerticalAlign();
    [GeneratedRegex("^(normal|nowrap|pre|pre-wrap|pre-line|break-spaces)$", RegexOptions.IgnoreCase)]
    private static partial Regex WhiteSpace();
    [GeneratedRegex("^(normal|break-all|keep-all|break-word)$", RegexOptions.IgnoreCase)]
    private static partial Regex WordBreak();
    [GeneratedRegex("^([1-9]|1[0-6])$")]
    private static partial Regex TabSize();
    [GeneratedRegex("^[a-z-]{1,40}$", RegexOptions.IgnoreCase)]
    private static partial Regex CssIdentifier();
    [GeneratedRegex("^[\\w\\s#(),.%+-]+$")]
    private static partial Regex BorderValue();
}
