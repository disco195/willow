package core;

import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaFileObject;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Represents a java project.
 */
public class Project {
    private static final String DEFAULT_BIN_PATH = "bin/";
    private static final String DEFAULT_SRC_PATH = "src/";
    private String filename;
    private String code;
    private Path projectPath;
    private Path binPath;
    private Path srcPath;
    private Path mainPath;

    /**
     * Creates the java project with the received code filename and content.
     */
    public Project(String filename, String code) {
        this.filename = filename;
        this.code = code;
        this.projectPath = null;
    }

    public boolean isGenerated() {
        return projectPath != null;
    }

    public boolean isCompiled() {
        return binPath != null;
    }

    public String getMainClass() {
        return filename.substring(0, filename.lastIndexOf('.'));
    }

    public String getFilename() {
        return filename;
    }

    public String getCode() {
        return code;
    }

    public Path getProjectPath() {
        return projectPath;
    }

    public Path getBinPath() {
        return binPath;
    }

    public Path getSrcPath() {
        return srcPath;
    }

    public Path getMainPath() {
        return mainPath;
    }

    public void generate() throws InstantiationException, IOException {
        if (isGenerated()) throw new IllegalStateException("project already generated");
        if (code.isBlank())
            throw new InstantiationException("Compilation fail:\nUnable to create class from empty file.");
        projectPath = Files.createTempDirectory("");
        srcPath = Path.of(projectPath.toString(), DEFAULT_SRC_PATH);
        mainPath = Path.of(srcPath.toString(), filename);
        Files.createDirectory(srcPath);
        Files.writeString(mainPath, code);
    }

    public void compile() throws InstantiationException, IOException {
        if (!isGenerated()) throw new IllegalStateException("project not generated");

        binPath = Path.of(projectPath.toString(), DEFAULT_BIN_PATH);
        Files.createDirectory(binPath);

        var compiler = ToolProvider.getSystemJavaCompiler();
        var dgCollector = new DiagnosticCollector<JavaFileObject>();
        var fileManager = compiler.getStandardFileManager(dgCollector, Locale.ENGLISH, StandardCharsets.UTF_8);
        var projectFiles = Stream.of(mainPath).map(p -> p.toAbsolutePath().toString()).toArray(String[]::new);
        var javaFiles = fileManager.getJavaFileObjects(projectFiles);
        var javacOptions = List.of(
                "-d", binPath.toString(),
                "-cp", srcPath.toString(),
                "-g",
                "-proc:none"
        );
        var output = new StringWriter();
        var task = compiler.getTask(output, fileManager, dgCollector, javacOptions, null, javaFiles);
        if (!task.call())
            throw new InstantiationException(
                    "Compilation fail:\n" + output.toString() +
                            dgCollector.getDiagnostics().stream()
                                    .map(Diagnostic::toString)
                                    .collect(Collectors.joining("\n", "\n", "\n"))
            );
    }

    public List<String> getClasses() {
        if (!isCompiled()) throw new IllegalStateException("project not compiled");

        try {
            return Files.list(binPath)
                    .map(p -> p.getFileName().toString())
                    .map(s -> s.substring(0, s.lastIndexOf('.')))
                    .collect(Collectors.toList());
        } catch (IOException e) {
            return List.of();
        }
    }
}