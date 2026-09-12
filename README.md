# Material Video Studio

Profesjonalny, w pełni przeglądarkowy edytor wideo (React + TypeScript + Vite) z interfejsem
zbudowanym zgodnie z **Google Material Design 3 / Material 3 Expressive**.

Aplikacja startuje **całkowicie pusta** — nie zawiera żadnych przykładowych filmów, zdjęć, muzyki
ani projektów. Wszystkie materiały pochodzą wyłącznie z importu użytkownika i **nigdy nie opuszczają
urządzenia** (całe przetwarzanie odbywa się lokalnie).

---

## 1. Instalacja i uruchomienie

```bash
npm install          # instalacja zależności
npm run dev          # serwer deweloperski (http://localhost:5173)
npm run build        # build produkcyjny → dist/
npm run preview      # podgląd builda produkcyjnego
```

Wymagania: Node 18+, przeglądarka desktopowa z obsługą `MediaRecorder`
i `canvas.captureStream` (Chrome / Edge / Firefox / Safari 17+).

---

## 2. Struktura projektu

```
src/
├── components/
│   ├── common/        Snackbary, overlay importu, dialogi projektów/skrótów/markerów
│   ├── export/        Okno eksportu (profile, kodeki, bitrate, postęp, cel zapisu)
│   ├── inspector/     Prawy panel — transform, kolor, audio, efekty, tekst, napisy
│   ├── layout/        Top app bar
│   ├── media/         Biblioteka mediów, efektów, przejść i tekstu
│   ├── preview/       Podgląd na żywo + transport
│   ├── settings/      Ustawienia aplikacji i projektu
│   ├── timeline/      Oś czasu, ścieżki, klipy, waveform, markery
│   └── ui/            Biblioteka komponentów Material 3 (button, chip, dialog, slider…)
├── features/
│   ├── project/       Fabryki obiektów domenowych (projekt, klipy, efekty, style)
│   └── timeline/      Czyste selektory: długość, kolizje, snapping, wyszukiwanie klipów
├── hooks/             useMediaImport, usePlayback, useProjectPersistence, useShortcuts
├── services/
│   ├── audio/         Web Audio: dekodowanie, peaki, worker analizy przebiegu
│   ├── export/        Silnik eksportu, profile, wykrywanie możliwości przeglądarki
│   ├── ffmpeg/        Adaptery FFmpeg (WebAssembly + natywny backend)
│   ├── media/         Sonda metadanych/kodeków, pula elementów medialnych
│   ├── playback/      Silnik odtwarzania (synchronizacja mediów + miks audio)
│   ├── project/       IndexedDB (projekty, binaria, recovery) + localStorage (ustawienia)
│   ├── render/        Kompozytor klatek (canvas 2D, filtry, przejścia, tekst)
│   └── subtitles/     Parser i serializer SRT/VTT
├── stores/            Zustand: projectStore, uiStore, settingsStore, exportStore
├── theme/             Dynamiczny kolor M3 (tonalne palety OKLCH, light/dark/AMOLED)
├── types/             Pełny model domenowy TypeScript
└── utils/             Formatowanie czasu/rozmiaru, throttle/debounce, pobieranie plików
```

---

## 3. Co działa naprawdę (bez atrap)

| Obszar | Implementacja |
| --- | --- |
| Import | Drag & drop + wybór plików, wiele plików naraz, postęp i etapy analizy |
| Metadane | Czas, rozdzielczość, FPS (`requestVideoFrameCallback`), rozmiar, kanały audio |
| Kodeki | Sniffing kontenera: `avc1/hvc1/av01/vp09`, Matroska `V_*`/`A_*`, RIFF, ftyp |
| Waveform | Realne peaki z `decodeAudioData`, liczone w Web Workerze, cięte wg zoomu |
| Montaż | Wielościeżkowość, przesuwanie, trim, split, duplikacja, snapping, markery |
| Podgląd | Kompozytor canvas 2D + synchronizacja `<video>`/`<audio>` w jednej pętli rAF |
| Audio | Web Audio: gain, pan, mute/solo, fade in/out, głośność ścieżek, master |
| Efekty | Filtry canvas (blur, kontrast, saturacja, sepia, hue…), winieta, ziarno, glow, high-pass sharpen |
| Kolor | Ekspozycja, kontrast, saturacja, temperatura, tinta, światła, cienie |
| Tekst/napisy | Warstwy tekstowe z animacjami, import/eksport SRT i VTT, styl i pozycja |
| Eksport | Render kompozycji → `canvas.captureStream` → `MediaRecorder` (+ audio z Web Audio) |
| Transkodowanie | `ffmpeg.wasm` ładowany na żądanie z CDN (MP4/H.264, WebM/VP9 itd.) |
| Zapis | IndexedDB: projekt + binaria + autozapis i odzyskiwanie sesji |

### Granice środowiska przeglądarkowego (komunikowane wprost w UI)

* Kodowanie **H.265/HEVC** i **AV1** zależy od przeglądarki (`MediaRecorder.isTypeSupported`)
  lub od rdzenia FFmpeg. Jednowątkowy `@ffmpeg/core` nie zawiera `libx265`/`libaom` — wtedy
  aplikacja pokazuje czytelny błąd i proponuje backend z natywnym FFmpeg.
* Render przez `MediaRecorder` przebiega w czasie rzeczywistym (1× długości materiału).
* Zapis bezpośrednio na wskazany nośnik wymaga **File System Access API**; bez niego używany jest
  zwykły mechanizm pobierania (informacja w snackbarze — brak udawania obsługi).

---

## 4. Podłączenie natywnego FFmpeg (backend)

`src/services/ffmpeg/index.ts` definiuje interfejs `FFmpegEngine`. Klasa `BackendFFmpeg`
oczekuje serwisu spełniającego kontrakt:

```
GET  {baseUrl}/health      → 200 OK
POST {baseUrl}/transcode   multipart/form-data
     file      – materiał pośredni z przeglądarki
     settings  – JSON ExportSettings
     args      – JSON string[] (argumenty ffmpeg)
     ← odpowiedź: zakodowany plik (binarnie)
```

Adres backendu ustawia się w *Ustawienia → Silnik renderowania*. Funkcja `buildFFmpegArgs()`
generuje gotowe argumenty (kodek, bitrate, skalowanie, `-movflags +faststart`, kodek audio),
więc serwer może po prostu wywołać `ffmpeg <args>`.

---

## 5. Skróty klawiszowe

`Spacja` odtwarzanie · `J/K/L` shuttle · `S` split · `M` marker · `Delete` usuń ·
`←/→` klatka · `Shift+←/→` sekunda · `Home/End` początek/koniec ·
`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` undo/redo · `Ctrl/Cmd+C/V` kopiuj/wklej ·
`Ctrl/Cmd+D` duplikuj · `Ctrl/Cmd+A` zaznacz wszystko · `Ctrl/Cmd+S` zapis ·
`V/C` zaznaczanie/żyletka · `Esc` wyczyść zaznaczenie.

---

## 6. Wydajność

* Playhead aktualizuje DOM przez referencje (`usePlayheadRef`) — ruch playheada **nie**
  powoduje re-renderu Reacta.
* Pętla rAF renderuje tylko gdy trwa odtwarzanie lub kompozycja jest oznaczona jako „dirty”.
* Klipy są memoizowane (`React.memo`), waveformy rysowane na dedykowanych canvasach.
* Analiza przebiegu audio działa w Web Workerze (inline blob — bez dodatkowych plików).
* Historia undo/redo scala szybkie zmiany (suwaki) w jeden wpis.

---

## 7. Przygotowane rozszerzenia

Architektura wydziela adaptery gotowe pod: proxy media, keyframes, chroma key, LUT,
multicam, audio ducking, napisy AI / speech-to-text, stabilizację i detekcję scen —
każda z tych funkcji może korzystać z `FFmpegEngine` (backend) lub z `WebCodecs`,
bez zmian w warstwie UI.
