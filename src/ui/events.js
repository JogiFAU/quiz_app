import { $, toast } from "../utils.js";
import { state, resetEditorState } from "../state.js";
import { loadJsonFiles, syncQuestionToSource, buildDatasetExports } from "../data/loaders.js";
import { loadZipFile } from "../data/zipImages.js";
import { filterByExams, filterByImageMode, searchQuestions } from "../quiz/filters.js";
import { renderAll, updateExamLists } from "./render.js";

function selectedExamsFromList() {
  const el = $("examListSearch");
  if (!el) return [];
  return Array.from(el.querySelectorAll("input[type=checkbox][data-exam]:checked"))
    .map((x) => x.dataset.exam)
    .filter(Boolean);
}

function buildSearchConfigFromUi() {
  return {
    exams: selectedExamsFromList(),
    imageFilter: $("imageFilterSearch").value,
    query: $("searchText").value,
    inAnswers: $("searchInAnswers").checked,
  };
}

function computeSearchSubset(config) {
  let qs = state.questionsAll.slice();
  qs = filterByExams(qs, config.exams);
  qs = filterByImageMode(qs, config.imageFilter);
  return searchQuestions(qs, { query: config.query, inAnswers: config.inAnswers });
}

function resetSearchConfig() {
  $("imageFilterSearch").value = "all";
  $("searchText").value = "";
  $("searchInAnswers").checked = false;
  $("pageSize").value = "50";
  $("pageNumber").value = "1";
}

function baseFilenameFromUrl(url) {
  const clean = String(url || "").split("?")[0];
  const seg = clean.split("/").filter(Boolean).pop();
  return seg || "export.json";
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function syncAllQuestions() {
  for (const q of state.questionsAll) syncQuestionToSource(q);
}

function saveAsOriginalDownload() {
  syncAllQuestions();
  const exports = buildDatasetExports();
  exports.forEach((entry) => {
    downloadJson(entry.payload, baseFilenameFromUrl(entry.url));
  });
  state.dirty = false;
  renderAll();
  toast("Export mit Original-Dateinamen heruntergeladen.");
}

function saveAsCopyDownload() {
  syncAllQuestions();
  const suffix = ($("copySuffix")?.value || "bearbeitet").trim() || "bearbeitet";
  const exports = buildDatasetExports();
  exports.forEach((entry) => {
    const base = baseFilenameFromUrl(entry.url).replace(/\.json$/i, "");
    downloadJson(entry.payload, `${base}_${suffix}.json`);
  });
  toast("Bearbeitete Kopie heruntergeladen.");
}

async function loadDatasetFromFiles(jsonFiles, zipFile = null) {
  if (!jsonFiles.length) {
    alert("Bitte mindestens eine JSON-Datei auswählen.");
    return;
  }

  try {
    await loadJsonFiles(jsonFiles);
    await loadZipFile(zipFile);

    const label = jsonFiles.length === 1
      ? jsonFiles[0].name
      : `${jsonFiles.length} Dateien`;

    state.activeDataset = { id: "upload", label };
    resetEditorState();
    updateExamLists();
    resetSearchConfig();
    await renderAll();

    const fileHint = $("loadedFileHint");
    if (fileHint) {
      const zipHint = zipFile ? ` + ${zipFile.name}` : "";
      fileHint.textContent = `Geladen: ${jsonFiles.map((f) => f.name).join(", ")}${zipHint}`;
    }

    toast("Dateien geladen.");
  } catch (e) {
    alert("Fehler beim Laden der Dateien: " + e);
  }
}

export function wireUiEvents() {
  let selectedJsonFiles = [];
  let selectedZipFile = null;

  $("pickJsonBtn").addEventListener("click", () => $("jsonFileInput").click());
  $("pickZipBtn").addEventListener("click", () => $("zipFileInput").click());

  $("jsonFileInput").addEventListener("change", async (e) => {
    selectedJsonFiles = Array.from(e.target.files || []);
    await loadDatasetFromFiles(selectedJsonFiles, selectedZipFile);
  });

  $("zipFileInput").addEventListener("change", async (e) => {
    selectedZipFile = (e.target.files || [])[0] || null;
    if (selectedJsonFiles.length) {
      await loadDatasetFromFiles(selectedJsonFiles, selectedZipFile);
    }
  });

  $("startSearchBtn").addEventListener("click", async () => {
    if (!state.activeDataset) {
      alert("Bitte zuerst JSON-Datei(en) laden.");
      return;
    }

    const cfg = buildSearchConfigFromUi();
    const subset = computeSearchSubset(cfg);
    state.searchConfig = cfg;
    state.searchOrder = subset.map((q) => q.id);
    state.view = "search";
    $("pageNumber").value = "1";
    await renderAll();
  });

  $("resetConfigSearchBtn").addEventListener("click", async () => {
    resetSearchConfig();
    if (state.activeDataset) {
      state.view = "config";
      state.searchOrder = [];
      await renderAll();
    }
  });

  $("saveOriginalBtn").addEventListener("click", () => {
    if (!state.activeDataset) return;
    saveAsOriginalDownload();
  });

  $("saveCopyBtn").addEventListener("click", () => {
    if (!state.activeDataset) return;
    saveAsCopyDownload();
  });

  ["prevPage", "nextPage"].forEach((id) => {
    $(id).addEventListener("click", async () => {
      const cur = Number($("pageNumber").value || 1);
      $("pageNumber").value = String(id === "prevPage" ? Math.max(1, cur - 1) : cur + 1);
      await renderAll();
    });
  });
  ["pageSize", "pageNumber"].forEach((id) => $(id).addEventListener("change", async () => await renderAll()));

  ["imageFilterSearch", "searchText", "searchInAnswers"].forEach((id) => {
    const el = $(id);
    el.addEventListener(el.tagName === "INPUT" ? "input" : "change", async () => {
      if (state.view === "search") {
        const cfg = buildSearchConfigFromUi();
        state.searchOrder = computeSearchSubset(cfg).map((q) => q.id);
      }
      await renderAll();
    });
  });

  $("examListSearch").addEventListener("change", async () => {
    if (state.view === "search") {
      const cfg = buildSearchConfigFromUi();
      state.searchOrder = computeSearchSubset(cfg).map((q) => q.id);
    }
    await renderAll();
  });

  $("questionList").addEventListener("input", () => {
    state.dirty = true;
  });
}
