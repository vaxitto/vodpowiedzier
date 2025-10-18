# Task Solver Fluent Assistant

Rozszerzenie Chrome (Manifest V3) pozwalające zaznaczać tekst z dowolnej strony, opcjonalnie dołączać zrzuty ekranu i wysyłać zadania do API ChatGPT. Wyniki wyświetlane są w pływającym panelu w stylu Fluent oraz w popupie rozszerzenia.

## Instalacja

1. Sklonuj repozytorium lub pobierz paczkę z plikami.
2. W Chrome przejdź do `chrome://extensions` i włącz **Tryb dewelopera**.
3. Wybierz **Load unpacked** / **Wczytaj rozpakowane** i wskaż katalog z projektem.
4. Po instalacji kliknij ikonę rozszerzenia i w ustawieniach wprowadź własny klucz API OpenAI.

## Konfiguracja API

- Klucz API (pole wymagane) przechowywany jest lokalnie w `chrome.storage.sync`.
- Domyślny model to `gpt-4o-mini`. Możesz go zmienić w ustawieniach.
- Włącz tryb Debug, aby oglądać surowe odpowiedzi API, zużycie tokenów i dodatkowe logi.

## Skróty i obsługa

- `Ctrl+I` – aktywuje tryb rozwiązywania (na macOS może kolidować z kursywą w edytorach tekstu).
- Po zaznaczeniu tekstu pojawia się popup z pytaniem o dodanie obrazu (`T`/`N`).
- Wybierz `Tak`, aby zaznaczyć prostokątny obszar ekranu – zrzut zostanie przycięty i dołączony do zapytania.
- Wynik znajdziesz w panelu na stronie oraz w popupie rozszerzenia.

## Funkcje UI

- Panel pływający w stylu Fluent (ciemny motyw, akcent konfigurowalny).
- Licznik odpowiedzi przechowywany w `chrome.storage` i synchronizowany między widokami.
- Przycisk ⚙ otwiera modal ustawień z możliwością zmiany akcentu, modelu i trybu debug.
- Tryb dock/undock: panel możesz odpiąć i przeciągać po ekranie.
- Copy do schowka (opcjonalne uprawnienie `clipboardWrite`).

## Architektura

- `background.js` – moduł service worker obsługujący skrót klawiaturowy, przechwytywanie ekranu oraz komunikację z API.
- `content.js` – wstrzykuje UI (shadow DOM), zarządza interakcjami użytkownika, przechwytywaniem zaznaczeń i regionów.
- `api.js` – warstwa komunikacji z ChatGPT (timeout, retry, obsługa obrazów, logowanie w trybie debug).
- `popup.*` – interfejs popupu, prezentuje ostatnią odpowiedź i umożliwia szybkie kopiowanie.
- `settings.*` – strona ustawień (również osadzana jako modal w panelu).
- `styles/`, `fonts/`, `icons/` – zasoby stylistyczne (ciemny Fluent, czcionka Inter, ikony SVG).

## Testy

Projekt nie zawiera zautomatyzowanych testów. Zalecane scenariusze manualne:

1. Zaznacz tekst i wyślij bez obrazu (klawisz `N`).
2. Zaznacz tekst, dodaj obraz (klawisz `T`) i upewnij się, że przycięty zrzut trafia do zapytania.
3. Zmień kolor akcentu i zweryfikuj aktualizację panelu oraz popupu.
4. Włącz tryb Debug i sprawdź, czy pojawiają się dane `usage` oraz surowa odpowiedź.

## Bezpieczeństwo i prywatność

- Klucz API nie jest logowany (logi debug maskują go).
- Zrzuty ekranu wykonywane są lokalnie i przesyłane jedynie do API OpenAI w ramach zapytania użytkownika.
- Uprawnienia `tabs` i `activeTab` wymagane są do komunikacji z aktywną kartą oraz wykonania `captureVisibleTab`.

## Znane ograniczenia

- Skrót `Ctrl+I` może kolidować z funkcją kursywy w niektórych edytorach – można go zmienić w ustawieniach rozszerzeń Chrome.
- Do poprawnej pracy z obrazami wymagane jest przyznanie rozszerzeniu zgody na zrzuty ekranu (Chrome poprosi przy pierwszym użyciu).
