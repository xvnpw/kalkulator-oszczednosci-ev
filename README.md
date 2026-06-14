<div align="center">

  # Kalkulator Oszczędności EV


  <a href="https://github.com/xvnpw/kalkulator-oszczednosci-ev">
    <img src="./favicon1.png" alt="logo" width="200" height="200"/>
  </a>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

   🚗💸 **Kalkulator Oszczędności EV** to informacyjne i poglądowe narzędzie dla polskiego rynku, służące do obliczania korzyści oraz całkowitego kosztu posiadania (TCO) wynikających z przejścia na pojazd elektryczny (EV).

</div>

**Kalkulacje mają charakter informacyjny i nie stanowi porady podatkowej.**

## Funkcje

- **Wspólne rozliczenie podatkowe:** Obsługuje obliczenia według skali PIT 2026 dla małżonków rozliczających się wspólnie (gdy oboje korzystają ze Skali opodatkowania).
- **Modele finansowania:** Porównanie zakupu za gotówkę, leasingu (operacyjnego/finansowego) oraz kredytu (Standardowy, 50/50, 3x33).
- **Korzyści podatkowe:**
    - Limity amortyzacji EV (225 tys. PLN).
    - Regulowana stawka amortyzacji dla używanych EV (20% lub 40%) w celu optymalizacji odliczeń.
    - Odliczenia kosztów użytku mieszanego (75% kosztów, 50% VAT). Uwzględnia czynniki VAT w obliczeniach kosztów leasingu na podstawie statusu płatnika VAT.
    - Obsługa płatnika VAT.
- **Śledzenie strat w działalności:** Monitoruje „zmarnowane" odliczenia podatkowe (utracone koszty), gdy dochód jest niewystarczający, aby w pełni wykorzystać tarcze podatkowe związane z EV.
- **Analiza TCO:** Obejmuje oszczędności na paliwie vs. energii elektrycznej, ubezpieczenie oraz koszty utrzymania, skorygowane o inflację.
- **Modele ekonomiczne i finansowe:**
    - **Dyskontowanie NPV (korekta inflacyjna):** Wykorzystuje dyskontowanie wartości bieżącej netto (NPV) do korygowania przyszłych rat finansowania (takich jak płatności leasingowe/kredytowe oraz wykupy) o stopę inflacji CPI, pozostawiając płatności z roku 0 niezdyskontowane.
    - **Progresywna inwestycja alternatywna:** Reprezentuje inwestycję progresywną (gdzie przepływy pieniężne/raty są inwestowane stopniowo w kolejnych latach posiadania, w miarę jak są „oszczędzane" w porównaniu z zakupem za gotówkę z góry) zamiast jednorazowej inwestycji ryczałtowej na początku.
- **System edukacyjny:** Interaktywne podpowiedzi wyjaśniające złożone pojęcia podatkowe (koszty uzyskania przychodu, TCO, VAT itp.) oraz dedykowana sekcja Słowniczka.
- **Obliczenia krok po kroku:** Szczegółowy, rozwijany podział roczny porównujący podstawę opodatkowania i zobowiązania przed oraz po zakupie EV.

## Polska logika podatkowa

Kalkulator uwzględnia konkretne polskie przepisy podatkowe (stan na 2026 r.) i jest zbudowany wokół następujących zasad:

### 1. Podatnik & Małżonek
- **Podatnik:** Główny podatnik, który może wybrać źródło dochodu (Umowa o pracę lub Działalność gospodarcza) oraz system podatkowy (Skala, Liniowy lub Ryczałt).
- **Małżonek:** Opcjonalny małżonek, którego sekcję można włączyć za pomocą pola wyboru „Wspólne rozliczenie z małżonkiem". Gdy wspólne rozliczenie jest aktywne, forma podatkowa małżonka jest zablokowana na **Skali podatkowej**, zgodnie z polskimi przepisami podatkowymi.

### 2. Systemy podatkowe i logika
- **Skala podatkowa (12% / 32% progresywny PIT):**
  - Standardowe progresywne stawki PIT (12% do 120 000 PLN, 32% powyżej).
  - Składka zdrowotna to płaskie **9%** dochodu.
  - Wspólne rozliczenie jest dozwolone **tylko** wtedy, gdy zarówno główny podatnik, jak i małżonek wybiorą system Skali podatkowej.
- **Podatek liniowy (19% płaski PIT):**
  - Płaska stawka PIT **19%**.
  - Składka zdrowotna to **4,9%** dochodu (z zastrzeżeniem progów minimalnego wynagrodzenia).
  - Łączna nominalna podstawowa tarcza podatkowa wynosi **23,9%** (19% PIT + 4,9% składki zdrowotnej).
  - Wybór Liniowego dla głównego podatnika automatycznie wyłącza i odznacza wspólne rozliczenie.
- **Ryczałt ewidencjonowany (podatek zryczałtowany od przychodu):**
  - Stawka PIT oparta jest na przychodzie (dostępne stawki: 3%, 5,5%, 8,5%, 12%, 15%, 17%).
  - Składka zdrowotna obliczana jest według trzech progów opartych na przychodzie, powiązanych z przeciętnym polskim wynagrodzeniem (<= 60 tys. PLN, 60 tys. – 300 tys. PLN oraz > 300 tys. PLN).
  - Zapewnia **0% tarczy kosztowej** dla wydatków na samochód (kosztów nie można odliczyć od przychodu).
  - Wybór Ryczałtu dla głównego podatnika automatycznie wyłącza i odznacza wspólne rozliczenie.
  - Tarcza VAT (50% odliczenia VAT od kosztów samochodu o użytku mieszanym) jest dostępna **tylko** wtedy, gdy podatnik jest zarejestrowany jako płatnik VAT.

### 3. Alokacja kosztów samochodu
- Wszystkie odliczenia podatkowe związane z pojazdem (amortyzacja, ubezpieczenie, utrzymanie) są przypisywane **wyłącznie do głównego podatnika (Podatnika)**.
- Indywidualny dochód/zobowiązanie podatkowe małżonka nie jest pomniejszane o koszty samochodu.

## Obliczenia ekonomiczne i TCO

Kalkulator stosuje zaawansowane modele korekt ekonomicznych, aby zapewnić realistyczne porównania całkowitego kosztu posiadania (TCO):

### 1. Dyskontowanie NPV (korekta inflacyjna)
Przyszłe wypływy pieniężne związane z finansowaniem (np. raty leasingowe, raty kredytu oraz wykupy) są dyskontowane do ich wartości bieżącej netto (NPV) przy użyciu stopy inflacji CPI:
- **Rok 0 (płatności z góry):** Koszty początkowe, takie jak wpłaty własne, opłaty wstępne oraz wypływ pieniężny z pierwszego roku, pozostają niezdyskontowane, aby odzwierciedlić ich bezpośrednią wartość bieżącą w momencie zakupu.
- **Lata 1+:** Przyszłe raty są dyskontowane corocznie według następującego wzoru:
  $$\text{Koszt realny} = \frac{\text{Nominalny wypływ pieniężny}}{(1 + \text{stopa inflacji CPI})^y}$$
  gdzie $y$ to rok wypływu pieniężnego (indeksowany od 0).

### 2. Model inwestycji alternatywnej
Zamiast obliczać koszt alternatywny jako jednorazową inwestycję ryczałtową w roku 0, kalkulator wdraża **progresywny model inwestycyjny**:
- **Inwestycja stopniowa:** Przepływy pieniężne i raty są symulowane jako inwestowane stopniowo w kolejnych latach posiadania, w miarę jak są „oszczędzane" (tj. zatrzymywane w posiadaniu i wypłacane w czasie w ramach umowy finansowania) w porównaniu z zapłatą całej ceny zakupu z góry jako kwoty ryczałtowej.
- **Koszt alternatywny kapitału:** Koszt alternatywny reprezentuje skumulowany procent składany zyskany lub utracony na tych rozłożonych w czasie przepływach pieniężnych, w miarę jak występują one w okresie posiadania, zapewniając dokładniejszą projekcję alternatyw finansowania.

### 3. Doprecyzowanie metryk kosztów
- **Realny koszt zakupu:** Reprezentuje wyłącznie koszt zakupu/finansowania pomniejszony o korzyści podatkowe. Wyklucza koszty operacyjne, takie jak utrzymanie i ubezpieczenie, które są śledzone jedynie w ogólnym TCO.

## Struktura plików

- `index.html`: Główny punkt wejścia (struktura HTML).
- `style.css`: Nowoczesna stylistyka w ciemnym motywie.
- `script.js`: Logika finansowa i interaktywność UI (moduł ES).

## Jak uruchomić

### W przeglądarce
1.  Ponieważ ten projekt używa **modułów ES**, musisz serwować pliki za pomocą lokalnego serwera HTTP.
    - Przy użyciu Node.js: `pnpm run dev`
    - Przy użyciu VS Code: rozszerzenie „Live Server".
2.  Otwórz adres serwera (np. `http://localhost:3000`) w dowolnej nowoczesnej przeglądarce internetowej.
3.  `Google Fonts` z CDN wymagane jest połączenie z internetem.

### Uruchamianie testów
1.  Upewnij się, że zainstalowane są **Node.js** oraz **pnpm v11**.
2.  Zainstaluj zależności: `pnpm install`
3.  Wykonaj testy: `pnpm test`

### Budowanie do produkcji
Aby wygenerować zminifikowane i zoptymalizowane pliki wyjściowe w katalogu `dist/` (kompatybilne z GitHub Pages lub hostingiem statycznym):
1.  Zainstaluj zależności: `pnpm install`
2.  Uruchom skrypt budowania: `pnpm run build`

## Technologie

- **Frontend:** HTML5 / CSS3 (Vanilla), moduły ES
- **Testowanie:** [Vitest](https://vitest.dev/)
- **Zarządzanie pakietami:** pnpm v11 (z hartowaniem bezpieczeństwa)
- **Czcionki:** [Google Fonts](https://fonts.google.com/) (Plus Jakarta Sans, JetBrains Mono)
