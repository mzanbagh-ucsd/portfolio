# Project 3 data

`life-expectancy.csv` is the local dataset used by the interactive visualization.

- Observations: World Bank API indicator `SP.DYN.LE00.IN`, “Life expectancy at birth, total (years),” for 1960–2020.
- Snapshot: the API response reported a source update date of 2026-10-08.
- Country names and ISO3 codes: World Bank API response.
- Regions: `Metadata_Country_API_8_DS2_en_csv_v2_3052924.csv` from [World Bank Data by Indicators](https://github.com/light-and-salt/World-Bank-Data-by-Indicators/tree/master/health).
- GitHub dataset inspection: its health metadata lists the indicator, but the downloadable pre-cleaned and raw health CSV files do not contain its observations. The API supplies the missing series from the same underlying World Bank source.
- Transformation: the snapshot keeps non-missing observations for countries that have a World Bank region classification. No values are imputed or changed.

The API endpoint used to create the snapshot was:

`https://api.worldbank.org/v2/country/all/indicator/SP.DYN.LE00.IN?date=1960:2020&format=json&per_page=20000`
