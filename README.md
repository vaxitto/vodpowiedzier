# Task Solver Fluent Assistant

Rozszerzenie Chrome (Manifest V3), które pobiera treść ze schowka po skrócie klawiaturowym i wysyła ją do API ChatGPT. Odpowiedź prezentowana jest w pływającym panelu w stylu Fluent oraz w popupie rozszerzenia.

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

- `Ctrl+I` – aktywuje rozwiązywanie treści ze schowka (na macOS może kolidować z kursywą w edytorach tekstu).
- Po użyciu skrótu rozszerzenie pobiera tekst ze schowka i przesyła go do API ChatGPT.
- Wynik znajdziesz w panelu na stronie oraz w popupie rozszerzenia.
- Jeżeli schowek jest pusty lub odczyt się nie powiedzie, w panelu pojawi się stosowna informacja.

## Funkcje UI

- Panel pływający w stylu Fluent (ciemny motyw, akcent konfigurowalny).
- Licznik odpowiedzi przechowywany w `chrome.storage` i synchronizowany między widokami.
- Przycisk ⚙ otwiera modal ustawień z możliwością zmiany akcentu, modelu i trybu debug.
- Tryb dock/undock: panel możesz odpiąć i przeciągać po ekranie.
- Kopiowanie wygenerowanej odpowiedzi do schowka (opcjonalne uprawnienie `clipboardWrite`).

## Architektura

- `background.js` – moduł service worker obsługujący skrót klawiaturowy oraz komunikację z API.
- `content.js` – wstrzykuje UI (shadow DOM), pobiera tekst ze schowka i prezentuje odpowiedź.
- `api.js` – warstwa komunikacji z ChatGPT (timeout, retry, logowanie w trybie debug).
- `popup.*` – interfejs popupu, prezentuje ostatnią odpowiedź i umożliwia szybkie kopiowanie.
- `settings.*` – strona ustawień (również osadzana jako modal w panelu).
- `styles/`, `fonts/`, `icons/` – zasoby stylistyczne (ciemny Fluent, czcionka Inter, ikony SVG).

## Testy

Projekt nie zawiera zautomatyzowanych testów. Zalecane scenariusze manualne:

1. Skopiuj tekst do schowka i użyj `Ctrl+I`, aby sprawdzić, czy odpowiedź pojawia się w panelu oraz popupie.
2. Przetestuj reakcję panelu na pusty schowek lub brak uprawnień do jego odczytu.
3. Zmień kolor akcentu i zweryfikuj aktualizację panelu oraz popupu.
4. Włącz tryb Debug i sprawdź, czy pojawiają się dane `usage` oraz surowa odpowiedź.

## Bezpieczeństwo i prywatność

- Klucz API nie jest logowany (logi debug maskują go).
- Uprawnienia `tabs` i `activeTab` wymagane są do komunikacji z aktywną kartą i wysyłania wiadomości do skryptu zawartości.
- Uprawnienie `clipboardRead` umożliwia pobranie tekstu ze schowka wyłącznie po aktywnym skrócie.

## Znane ograniczenia

- Skrót `Ctrl+I` może kolidować z funkcją kursywy w niektórych edytorach – można go zmienić w ustawieniach rozszerzeń Chrome.
- Odczyt schowka może wymagać dodatkowego potwierdzenia przeglądarki; w razie niepowodzenia panel poinformuje o braku dostępu.
