using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using MoonSharp.Interpreter;

internal static class Program
{
    private const string Library = "Tabletop Simulator_Data/Managed/MoonSharp.Interpreter.dll";

    private static int Main(string[] args)
    {
        try
        {
            var options = ParseArguments(args);
            var script = new Script();
            var source = File.ReadAllText(options.Path, new System.Text.UTF8Encoding(false, true));
            var result = script.DoString(source, null, options.Path);

            if (options.SnapshotPath.Length > 0)
            {
                var snapshot = ConvertValue(script.Globals.Get(options.SnapshotGlobal));
                WriteJson(options.SnapshotPath, snapshot);
            }

            var report = new Dictionary<string, object?>
            {
                ["passed"] = true,
                ["engine"] = script.DoString("return _VERSION", null, "version").String,
                ["result"] = result.ToString(),
                ["script"] = options.Path,
                ["library"] = Library,
                ["inGameUIAutomationTested"] = false
            };
            var json = JsonSerializer.Serialize(report, JsonOptions(true));
            if (options.ReportPath.Length > 0)
            {
                File.WriteAllText(options.ReportPath, json, new System.Text.UTF8Encoding(false));
            }

            Console.WriteLine(json);
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine(exception.Message);
            if (exception is InterpreterException interpreterException)
            {
                Console.Error.WriteLine(interpreterException.DecoratedMessage);
                Console.Error.WriteLine(interpreterException.CallStack);
            }

            return 1;
        }
    }

    private static Options ParseArguments(string[] args)
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < args.Length; index++)
        {
            var name = args[index];
            if (name is not ("-Path" or "-ReportPath" or "-SnapshotPath" or "-SnapshotGlobal") ||
                index + 1 >= args.Length)
            {
                throw new ArgumentException("Usage: MoonSharpRunner -Path <file> [-ReportPath <file>] " +
                    "[-SnapshotPath <file>] [-SnapshotGlobal <name>]");
            }

            values[name] = args[++index];
        }

        if (!values.TryGetValue("-Path", out var path) || path.Length == 0)
        {
            throw new ArgumentException("-Path is required.");
        }

        return new Options(
            path,
            values.GetValueOrDefault("-ReportPath", ""),
            values.GetValueOrDefault("-SnapshotPath", ""),
            values.GetValueOrDefault("-SnapshotGlobal", "PreviewCompactXml"));
    }

    private static object? ConvertValue(DynValue value)
    {
        switch (value.Type)
        {
            case DataType.Table:
                var map = new Dictionary<string, object?>();
                foreach (var pair in value.Table.Pairs)
                {
                    var key = pair.Key.Type == DataType.String
                        ? pair.Key.String
                        : pair.Key.Number.ToString(CultureInfo.InvariantCulture);
                    map[key] = ConvertValue(pair.Value);
                }

                return map;
            case DataType.String:
                return value.String;
            case DataType.Number:
                return value.Number;
            case DataType.Boolean:
                return value.Boolean;
            default:
                return null;
        }
    }

    private static void WriteJson(string path, object? value)
    {
        File.WriteAllText(path, JsonSerializer.Serialize(value, JsonOptions(true)), new System.Text.UTF8Encoding(false));
    }

    private static JsonSerializerOptions JsonOptions(bool indented) => new()
    {
        WriteIndented = indented,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private sealed record Options(string Path, string ReportPath, string SnapshotPath, string SnapshotGlobal);
}
