// ============================================================
//  Exact Content Copier — VS Code Extension (v1.0)
//  EXACT copy: file jaisi hai, waisi hi copy hogi.
//  NO comment stripping, NO trimming, NO cleaning.
// ============================================================

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const CATEGORY_FOLDER = "categorization-of-content";
const EXCLUDE_PREFIX = "!";

const CATEGORY_FILE_EXTS = [".txt", ".md", ".json", ".yaml", ".yml", ".eml", ".list"];

const EXT_TO_LANG = {
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".jsx": "jsx",
    ".ts": "typescript",
    ".mts": "typescript",
    ".tsx": "tsx",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".sass": "sass",
    ".less": "less",
    ".php": "php",
    ".phtml": "php",
    ".py": "python",
    ".pyw": "python",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".cs": "csharp",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".erb": "erb",
    ".swift": "swift",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".scala": "scala",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "zsh",
    ".sql": "sql",
    ".json": "json",
    ".jsonc": "jsonc",
    ".xml": "xml",
    ".svg": "xml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".md": "markdown",
    ".lua": "lua",
    ".dart": "dart",
    ".vue": "vue",
    ".r": "r",
    ".R": "r",
    ".pl": "perl",
    ".pm": "perl",
    ".ex": "elixir",
    ".exs": "elixir",
};

function activate(context) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "exactContentCopier.copyContent",
            async () => {
                try {
                    await runWorkflow();
                } catch (err) {
                    vscode.window.showErrorMessage(`Error: ${err.message}`);
                }
            }
        )
    );
}

async function runWorkflow() {
    const root = getRoot();
    if (!root) return;

    const catDir = path.join(root, CATEGORY_FOLDER);

    if (!fs.existsSync(catDir) || !fs.statSync(catDir).isDirectory()) {
        vscode.window.showWarningMessage(
            `Folder "${CATEGORY_FOLDER}" not found in project root. ` +
            `Create it and add category files (e.g. frontend.txt).`
        );
        return;
    }

    const catFiles = fs
        .readdirSync(catDir)
        .filter((f) => CATEGORY_FILE_EXTS.includes(path.extname(f).toLowerCase()))
        .sort();

    if (!catFiles.length) {
        vscode.window.showWarningMessage(
            `No category files in "${CATEGORY_FOLDER}/". ` +
            `Add .txt / .md / .yaml files with file paths listed inside.`
        );
        return;
    }

    const pick = await vscode.window.showQuickPick(
        catFiles.map((f) => ({
            label: f,
            description: path.join(CATEGORY_FOLDER, f),
        })),
        { placeHolder: "Select a category to copy (EXACT)...", matchOnDescription: true }
    );
    if (!pick) return;

    const raw = fs.readFileSync(path.join(catDir, pick.label), "utf-8");
    const { include: paths, exclude } = parsePaths(raw);

    if (!paths.length) {
        vscode.window.showWarningMessage(`No valid paths in "${pick.label}".`);
        return;
    }

    const res = await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Copying EXACT from "${pick.label}"...`,
            cancellable: false,
        },
        (progress) => aggregate(root, paths, exclude, progress)
    );

    if (!res.count) {
        vscode.window.showWarningMessage("No readable content found.");
        return;
    }

    await vscode.env.clipboard.writeText(res.content);
    vscode.window.showInformationMessage(
        `Copied ${res.count} file(s) EXACT` +
        (res.skip ? ` | ${res.skip} skipped` : "")
    );
}

function getRoot() {
    const wf = vscode.workspace.workspaceFolders;
    if (!wf || !wf.length) {
        vscode.window.showErrorMessage("No workspace/folder is open.");
        return null;
    }
    return wf[0].uri.fsPath;
}

function normalizeRel(p) {
    return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function parsePaths(text) {
    const include = [];
    const exclude = [];

    for (const line of text.split(/\r?\n/)) {
        const l = line.trim();
        if (!l || l.startsWith("#")) continue;

        if (l.startsWith(EXCLUDE_PREFIX)) {
            const p = normalizeRel(l.slice(EXCLUDE_PREFIX.length).trim());
            if (p) exclude.push(p);
        } else {
            include.push(l);
        }
    }

    return { include, exclude };
}

async function aggregate(root, paths, exclude, progress) {
    let out = "";
    let count = 0;
    let skip = 0;
    const total = paths.length;
    const excluded = new Set(exclude);

    for (let i = 0; i < total; i++) {
        const norm = paths[i].replace(/\\/g, "/");
        const abs = path.resolve(root, norm);

        if (!abs.startsWith(root)) {
            skip++;
            continue;
        }

        progress.report({
            message: `${i + 1}/${total}: ${norm}`,
            increment: 100 / total,
        });

        if (!fs.existsSync(abs)) {
            out += `NOT FOUND: \`${norm}\`\n\n`;
            skip++;
            continue;
        }

        const stat = fs.statSync(abs);

        if (stat.isFile()) {
            if (isExcluded(abs, root, excluded)) continue;
            const r = formatFile(abs, root);
            if (r) {
                out += r;
                count++;
            } else {
                skip++;
            }
        } else if (stat.isDirectory()) {
            for (const fp of listFilesRecursive(abs)) {
                if (isExcluded(fp, root, excluded)) continue;
                const r = formatFile(fp, root);
                if (r) {
                    out += r;
                    count++;
                }
            }
        }
    }

    // NO .trim() here. Out ko jaisa hai waisa hi rakho.
    return { content: out, count, skip };
}

function isExcluded(abs, root, excluded) {
    return excluded.has(normalizeRel(path.relative(root, abs)));
}

// ---- EXACT FORMAT: code ko bilkul haath nahi lagana ----
function formatFile(abs, root) {
    try {
        const rel = path.relative(root, abs);
        const ext = path.extname(abs).toLowerCase();

        if (isBinary(abs)) {
            return `BINARY: \`${rel}\`\n\n`;
        }

        // EXACT READ. No strip, no replace, no tidy, no trim.
        const code = fs.readFileSync(abs, "utf-8");

        const lang = EXT_TO_LANG[ext] || "";
        const fence = makeFence(code);

        // Fence ko apni line par lane ke liye sirf tab \n add karo
        // jab file ka aakhri char \n nahi hai. Ye \n code ka hissa nahi,
        // sirf fence ka separator hai. Agar file pehle se \n par khatam
        // hoti hai, to kuch add nahi karte. Empty file ke liye bhi kuch nahi.
        let codeForFence = code;
        if (code !== "" && !code.endsWith("\n")) {
            codeForFence = code + "\n";
        }

        return `📄 \`${rel}\`\n${fence}${lang}\n${codeForFence}${fence}\n\n`;
    } catch {
        return null;
    }
}

function isBinary(fp) {
    try {
        const fd = fs.openSync(fp, "r");
        const buf = Buffer.alloc(8192);
        const n = fs.readSync(fd, buf, 0, 8192, 0);
        fs.closeSync(fd);
        for (let i = 0; i < n; i++) {
            if (buf[i] === 0) return true;
        }
        return false;
    } catch {
        return false;
    }
}

function listFilesRecursive(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...listFilesRecursive(full));
        } else if (entry.isFile()) {
            results.push(full);
        }
    }
    return results.sort();
}

function makeFence(content) {
    let max = 0;
    let cur = 0;
    for (const ch of content) {
        cur = ch === "`" ? cur + 1 : 0;
        if (cur > max) max = cur;
    }
    return "`".repeat(Math.max(3, max + 1));
}

function deactivate() { }

module.exports = { activate, deactivate };