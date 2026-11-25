/* Sixfold localization. English is the source language; each additional locale
   is a source-string catalog so the existing static HTML needs no duplicate
   markup. Dynamic game copy is translated by a small pattern catalog and the
   public I18n.t() helper. */
(function () {
  'use strict';

  var KEY = 'sixfold.locale.v1';
  var SUPPORTED = {
    en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch',
    'zh-Hans': '简体中文', 'zh-Hant': '繁體中文', ja: '日本語', ko: '한국어',
    'pt-BR': 'Português (Brasil)', hi: 'हिन्दी', kn: 'ಕನ್ನಡ', ar: 'العربية'
  };
  var RTL = { ar: true };
  // Arabic and Hindi use their own digit shapes in the interface. Formatting
  // through Intl alone can still yield Latin digits on some engines, so the
  // final text pass maps every ASCII digit explicitly.
  var NUMERALS = {
    ar: ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'],
    hi: ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'],
    kn: ['೦', '೧', '೨', '೩', '೪', '೫', '೬', '೭', '೮', '೯']
  };
  var NUMBER_LOCALES = { ar: 'ar-u-nu-arab', hi: 'hi-u-nu-deva', kn: 'kn-u-nu-knda' };
  var locale = 'en';
  var catalog = { messages: {}, patterns: [] };

  var ES = {
    "Motion": "Movimiento",
    "System": "Sistema",
    "Full": "Completo",
    "Reduced": "Reducido",
    'Welcome to Sixfold': 'Te damos la bienvenida a Sixfold',
    'Six games, one place. Everything saves on this device.': 'Seis juegos en un solo lugar. Todo se guarda en este dispositivo.',
    'Tap any cover on the hub to start a game.': 'Toca cualquier portada de la pantalla de inicio para empezar una partida.',
    'Daily Sixfold gives you one fresh puzzle in every game, and keeps your streak.': 'Sixfold diario te da un puzle nuevo en cada juego y mantiene tu racha.',
    'Look changes the theme, language, contrast and backup. First-play tips wait inside each game.': 'Aspecto cambia el tema, el idioma, el contraste y la copia de seguridad. Dentro de cada juego encontrarás consejos para la primera partida.',
    'Start playing': 'Empezar a jugar',
    'Replay this guide from Look & feel.': 'Puedes repetir esta guía desde Aspecto.',
    'Guide': 'Guía',
    'Welcome & guide': 'Bienvenida y guía',
    'Six games, the daily set and where everything lives.': 'Los seis juegos, el set diario y dónde está todo.',
    'Daily Gauntlet': 'Gauntlet diario',
    'Six rounds. One run.': 'Seis rondas. Una partida.',
    'Start': 'Empezar',
    'Start the Daily Gauntlet': 'Empezar el Gauntlet diario',
    'Done today': 'Hecho hoy',
    'Last run': 'Última partida',
    'Again': 'Otra vez',
    'Start today': 'Empezar hoy',
    'Start another Daily Gauntlet': 'Empezar otro Gauntlet diario',
    'Start today’s Daily Gauntlet': 'Empezar el Gauntlet diario de hoy',
    'Run ended': 'Partida terminada',
    'Continue': 'Continuar',
    'Continue the Daily Gauntlet': 'Continuar el Gauntlet diario',
    'Start run': 'Empezar partida',
    'Start again': 'Empezar de nuevo',
    'Start today’s run': 'Empezar la partida de hoy',
    'Done earlier': 'Hecho antes',
    'Not played': 'Sin jugar',
    'Gauntlet rounds': 'Rondas del Gauntlet',
    'Started': 'Inicio',
    'Now': 'Ahora',
    'No run yet. Six games, one order, one time.': 'Aún no hay partida. Seis juegos, un orden, un tiempo.',
    'Runs': 'Partidas',
    'No runs yet.': 'Aún no hay partidas.',
    'Round {1} of {2}': 'Ronda {1} de {2}',
    'Round {1} / {2}': 'Ronda {1} / {2}',
    'Sixfold — Six games. No filler.': 'Sixfold — Seis juegos. Sin relleno.',
    'The pocket arcade': 'El arcade de bolsillo',
    'Six games. No filler.': 'Seis juegos. Sin relleno.',
    'Sixfold / hidden game': 'Sixfold / juego oculto',
    'You found it': 'Lo encontraste',
    'The cover opened.': 'La portada se abrió.',
    'A five-letter game was hiding in the six-piece fold.': 'Un juego de cinco letras se escondía en el pliegue de seis piezas.',
    'Play Wordle': 'Jugar a Wordle',
    '05 letters': '05 letras',
    '06 tries': '06 intentos',
    'No. 07': 'N.º 07',
    'Puzzle collection': 'Colección de puzles',
    'Look': 'Aspecto',
    'Warm': 'Cálido',
    'What’s new in 6.0': 'Novedades de 6.0',
    'Daily Gauntlet: play all six daily challenges in one run, leave and resume at any round, and keep one finish time.': 'Gauntlet diario: juega los seis retos diarios en una sola partida, sal y retómalo en cualquier ronda, y conserva un único tiempo final.',
    'A local profile on the badges page: daily and replay counts, bests, and every finished Gauntlet — stored on this device.': 'Un perfil local en la página de insignias: partidas diarias y repeticiones, mejores marcas y cada Gauntlet terminado, todo guardado en este dispositivo.',
    'A calmer finish: light, dark and palette changes fade smoothly, hidden games stop redrawing, and reduced motion still switches instantly.': 'Un acabado más sereno: los cambios de tema claro, oscuro y de paleta se funden suavemente, los juegos ocultos dejan de redibujarse y el movimiento reducido sigue siendo instantáneo.',
    'A sturdier app: saved cards reach the gallery, the window frame follows the app, and older Android WebViews stay supported.': 'Una app más sólida: las tarjetas guardadas llegan a la galería, el marco de la ventana acompaña a la app y las WebView antiguas de Android siguen funcionando.',
    'Six games.': 'Seis juegos.',
    'No filler.': 'Sin relleno.',
    'A small arcade for the in-between. Six satisfying puzzles, no accounts, no ads — and they work offline.': 'Un pequeño arcade para los ratos libres. Seis puzles satisfactorios, sin cuentas y sin anuncios, que funcionan sin conexión.',
    'Choose a game': 'Elige un juego',
    'Surprise me': 'Sorpréndeme',
    'No accounts': 'Sin cuentas',
    'No ads': 'Sin anuncios',
    'Works offline': 'Funciona sin conexión',
    'Play offline': 'Jugar sin conexión',
    'Offline': 'Sin conexión',
    'Daily Sixfold': 'Sixfold diario',
    'Sixfold Daily': 'Sixfold diario',
    '/6 games · ': '/6 juegos · ',
    '-day streak.': ' días seguidos.',
    'No spoilers — play today’s set:': 'Sin spoilers: juega el set de hoy:',
    'Today’s six.': 'Los seis de hoy.',
    'Today': 'Hoy',
    'day streak': 'días seguidos',
    'best': 'mejor',
    'Badge': 'Insignia',
    'Badges': 'Insignias',
    'Locked': 'Bloqueada',
    'Challenge finished': 'Reto completado',
    'Perfect six': 'Seis perfectos',
    'This week': 'Esta semana',
    'days to': 'días para',
    'games / week': 'juegos / semana',
    'Share today’s challenge': 'Compartir el reto de hoy',
    'Replay': 'Repetir',
    'Next badge': 'Próxima insignia',
    'Every game has a date-seeded daily. Pick one to begin.': 'Cada juego tiene un reto diario con semilla por fecha. Elige uno para empezar.',
    'Play daily Sudoku': 'Jugar al Sudoku diario',
    'Share daily': 'Compartir el diario',
    '30-day calendar': 'Calendario de 30 días',
    'The collection': 'La colección',
    'Six': 'Seis',
    'ways': 'formas',
    'in.': 'de entrar.',
    'One tap to play. Your progress stays on this device.': 'Un toque para jugar. Tu progreso se queda en este dispositivo.',
    'Numbers': 'Números',
    'Classic': 'Clásico',
    'Logic': 'Lógica',
    'Sorting': 'Clasificación',
    'Merging': 'Fusión',
    'Slide, double, repeat. Keep the board alive.': 'Desliza, dobla, repite. Mantén el tablero vivo.',
    'Endless · best saved': 'Sin fin · récord guardado',
    'Play': 'Jugar',
    'Fill every row, column and box with 1–9.': 'Rellena cada fila, columna y caja con 1–9.',
    '4 levels · one solution': '4 niveles · una solución',
    'Outplay the computer. Or a friend.': 'Gana a la máquina. O a un amigo.',
    '3 levels · 2 players': '3 niveles · 2 jugadores',
    'Read the numbers. Clear the field.': 'Lee los números. Despeja el campo.',
    '3 levels': '3 niveles',
    'Pour every colour into its own tube.': 'Vierte cada color en su propio tubo.',
    '8 levels · easy to hard': '8 niveles · de fácil a difícil',
    'Drop matching fruit. Don’t overflow.': 'Suelta fruta igual. No desbordes.',
    'Chrome install bug': 'Error de instalación en Chrome',
    'Chrome 154–156 cannot install a second app from github.io. Update Chrome to 157 or newer, then install Sixfold again.': 'Chrome 154–156 no puede instalar una segunda app desde github.io. Actualiza Chrome a 157 o posterior y vuelve a instalar Sixfold.',
    'Update Chrome': 'Actualizar Chrome',
    'Install app': 'Instalar app',
    'About & privacy': 'Acerca de y privacidad',
    'Licenses & source': 'Licencias y código fuente',
    'Slide the tiles. Match numbers to double them.': 'Desliza las fichas. Une números iguales para doblarlos.',
    'Score': 'Puntos',
    'Best': 'Mejor',
    'Moves': 'Movimientos',
    'Preview': 'Vista previa',
    'Game over': 'Fin de la partida',
    'No moves left.': 'No quedan movimientos.',
    'Share': 'Compartir',
    'Try again': 'Intentar de nuevo',
    'Save image': 'Guardar imagen',
    'Saved to your gallery.': 'Guardado en tu galería.',
    'Image downloaded.': 'Imagen descargada.',
    'Full screen': 'Pantalla completa',
    'Couldn’t save the image.': 'No se pudo guardar la imagen.',
    'New game': 'Nueva partida',
    'Tip: park your biggest tile in a corner.': 'Consejo: guarda tu ficha más grande en una esquina.',
    'Tip: build along one edge, not in the middle.': 'Consejo: construye junto a un borde, no en el centro.',
    'Tip: free a square before hunting for a merge.': 'Consejo: libera una casilla antes de buscar una unión.',
    'Tip: merge small tiles early, while it is easy.': 'Consejo: une fichas pequeñas pronto, mientras es fácil.',
    'Tip: leave a lane open for the next big tile.': 'Consejo: deja un pasillo libre para la próxima ficha grande.',
    'Tip: keep tiles stepping down toward your corner.': 'Consejo: mantén las fichas bajando hacia tu esquina.',
    'Tip: think twice — there is no undo.': 'Consejo: piénsalo dos veces, no hay deshacer.',
    'Tip: your board and best score are saved here.': 'Consejo: tu tablero y récord se guardan aquí.',
    'Tip: tap New game for a fresh board any time.': 'Consejo: toca Nueva partida para empezar un tablero cuando quieras.',
    'Tip: 3×3 is a quick round; 5×5 is a long one.': 'Consejo: 3×3 es una ronda rápida; 5×5 es larga.',
    'Tap a tube, then a target.': 'Toca un tubo y luego un destino.',
    'Tap a tube, then tap where to pour.': 'Toca un tubo y luego dónde verter.',
    'Daily Sixfold. First tap is safe.': 'Sixfold diario. La primera casilla es segura.',
    'Daily Sixfold. Same seeded level.': 'Sixfold diario. El mismo nivel con semilla.',
    'Hint used. Keep going.': 'Pista usada. Sigue así.',
    'Puzzle paused. Tap Resume to continue.': 'Puzle en pausa. Toca Reanudar para continuar.',
    'Puzzle paused. The timer is stopped.': 'Puzle en pausa. El reloj está parado.',
    'Back to the puzzle.': 'De vuelta al puzle.',
    'Tap a cell first.': 'Toca primero una celda.',
    'Givens are locked.': 'Las pistas están bloqueadas.',
    'Note toggled.': 'Nota cambiada.',
    'That digit does not fit here. Check the row, column and box.': 'Ese dígito no encaja aquí. Revisa la fila, la columna y la caja.',
    'Digit placed.': 'Dígito colocado.',
    'That cell is already empty.': 'Esa celda ya está vacía.',
    'Cell cleared.': 'Celda borrada.',
    'Nothing to undo.': 'No hay nada que deshacer.',
    'Undone.': 'Deshecho.',
    'Notes on. Tap numbers to pencil them in.': 'Notas activadas. Toca números para apuntarlos.',
    'Notes off.': 'Notas desactivadas.',
    'Candidates filled. Look for a naked or hidden single.': 'Candidatos rellenados. Busca un candidato único o uno oculto.',
    'Every cell is already correct.': 'Todas las celdas ya son correctas.',
    'Reveal a cell': 'Revelar una celda',
    'No naked or hidden single is available here. This reveal keeps the puzzle moving; the technique guide covers the next patterns.': 'Aquí no hay ningún candidato único ni oculto. Esta revelación mantiene el puzle en marcha; la guía de técnicas cubre los siguientes patrones.',
    'No simple single found. A reveal is ready in the panel.': 'No se encontró un candidato único sencillo. Hay una revelación lista en el panel.',
    'Sudoku reset. A fresh Easy puzzle is ready.': 'Sudoku reiniciado. Hay un puzle Fácil nuevo listo.',
    'X wins.': 'Gana X.',
    'O wins.': 'Gana O.',
    'A draw.': 'Empate.',
    'You win.': 'Ganas.',
    'Computer wins.': 'Gana la máquina.',
    'Three in a row.': 'Tres en raya.',
    'Every square filled. Nothing wasted.': 'Todas las casillas llenas. Nada desperdiciado.',
    'Field cleared.': 'Campo despejado.',
    'Mine hit.': 'Mina pisada.',
    'Every safe square is open.': 'Todas las casillas seguras están abiertas.',
    'Try a fresh field. The first square is always safe.': 'Prueba un campo nuevo. La primera casilla siempre es segura.',
    'Storage is not available in this browser.': 'El almacenamiento no está disponible en este navegador.',
    'Backup downloaded. Keep it somewhere safe.': 'Copia descargada. Guárdala en un lugar seguro.',
    'That backup is too large to be a Sixfold backup.': 'Esa copia es demasiado grande para ser una copia de Sixfold.',
    'That file is not a valid JSON backup.': 'Ese archivo no es una copia JSON válida.',
    'That file is not a Sixfold backup.': 'Ese archivo no es una copia de Sixfold.',
    'That backup contains too many entries.': 'Esa copia contiene demasiadas entradas.',
    'That backup contains an unsupported entry.': 'Esa copia contiene una entrada no compatible.',
    'Restore this Sixfold backup? It will replace every board, score and setting on this device.': '¿Restaurar esta copia de Sixfold? Reemplazará todos los tableros, récords y ajustes de este dispositivo.',
    'Backup restored. Reloading…': 'Copia restaurada. Recargando…',
    'Could not read that file.': 'No se pudo leer ese archivo.',
    'Add Sixfold to your home screen for an app-like, offline-friendly collection.': 'Añade Sixfold a tu pantalla de inicio para tener una colección tipo app, cómoda sin conexión.',
    'Drag to aim. Release to drop. Match two of the same fruit.': 'Arrastra para apuntar. Suelta para dejar caer. Une dos frutas iguales.',
    'Sharp computer: takes wins and blocks.': 'Máquina Agudo: aprovecha victorias y bloquea.',
    'GRID COMPLETE': 'CUADRÍCULA COMPLETA',
    'LEVEL CLEAR': 'NIVEL SUPERADO',
    'THREE IN A ROW': 'TRES EN RAYA',
    'CLEARED': 'DESPEJADO',
    'X WINS': 'GANA X',
    'O WINS': 'GANA O',
    'Now choose a tube with room on top.': 'Ahora elige un tubo con espacio arriba.',
    'Selection cleared.': 'Selección borrada.',
    'Nothing to undo yet.': 'Todavía no hay nada que deshacer.',
    'Computer is thinking…': 'La máquina está pensando…',
    "X's move.": 'Turno de X.',
    "O's move.": 'Turno de O.',
    'Two players. X starts.': 'Dos jugadores. Empieza X.',
    'Record reset. New round.': 'Récord reiniciado. Ronda nueva.',
    'Loose and forgiving.': 'Suelta y permisiva.',
    'Takes wins and blocks.': 'Aprovecha victorias y bloquea.',
    'Never misses.': 'No falla nunca.',
    'Watermelon! You reached the top of the fruit chain.': '¡Sandía! Has llegado a la cima de la cadena de frutas.',
    'Careful — the pile is close to the top.': 'Cuidado, la pila está cerca de arriba.',
    'Room again. Keep building pairs.': 'Hay sitio otra vez. Sigue creando parejas.',
    'Let the last fruit settle for a moment.': 'Deja que la última fruta se asiente un momento.',
    'Nearly full — look for a match.': 'Casi lleno — busca una pareja.',
    'Tap a square to begin. Long-press to flag.': 'Toca una casilla para empezar. Mantén pulsado para marcar.',
    'Mine hit. The field is revealed.': 'Mina pisada. El campo está al descubierto.',
    'Flag placed. Tap it again to remove it.': 'Bandera colocada. Toca otra vez para quitarla.',
    'Flag removed.': 'Bandera quitada.',
    'Flag mode on. Tap squares to mark mines.': 'Modo bandera activado. Toca casillas para marcar minas.',
    'Flag mode off. Tap to dig.': 'Modo bandera desactivado. Toca para cavar.',
    'New best!': '¡Nuevo récord!',
    'Back to game': 'Volver al juego',
    'Keep going': 'Seguir jugando',
    'You made it. Keep going for a bigger score?': 'Lo conseguiste. ¿Sigues a por más puntos?',
    'Try the same seeded field again.': 'Prueba otra vez el mismo campo con semilla.',
    'Result': 'Resultado',
    'Drag or use': 'Arrastra o usa',
    'Easy · Level 1 of 8': 'Fácil · Nivel 1 de 8',
    'Pour colours until every tube holds one.': 'Vierte colores hasta que cada tubo tenga uno.',
    'Level': 'Nivel',
    'Tap a tube, then tap where to pour.': 'Toca un tubo y luego dónde verter.',
    'Level clear.': 'Nivel superado.',
    'Every colour has its own tube.': 'Cada color tiene su propio tubo.',
    'Next level': 'Siguiente nivel',
    'Undo': 'Deshacer',
    'New board': 'Nuevo tablero',
    'Tap one tube, then another to pour.': 'Toca un tubo y luego otro para verter.',
    'Easy': 'Fácil',
    'Medium': 'Medio',
    'Hard': 'Difícil',
    'Beginner': 'Principiante',
    'Intermediate': 'Intermedio',
    'Expert': 'Experto',
    'Sharp': 'Agudo',
    'Perfect': 'Perfecto',
    'Fill every row, column and 3 × 3 box with 1–9.': 'Rellena cada fila, columna y caja de 3 × 3 con 1–9.',
    'Time': 'Tiempo',
    'Paused.': 'En pausa.',
    'Resume puzzle': 'Reanudar puzle',
    'Grid complete': 'Cuadrícula completa',
    'Solved.': 'Resuelto.',
    'The grid is complete.': 'La cuadrícula está completa.',
    'New puzzle': 'Nuevo puzle',
    'Tap a cell, then a number.': 'Toca una celda y luego un número.',
    'Naked single': 'Candidato único',
    'Place digit': 'Colocar dígito',
    'Technique guide': 'Guía de técnicas',
    'Notes': 'Notas',
    'Auto notes': 'Notas automáticas',
    'Erase': 'Borrar',
    'Hint': 'Pista',
    'No hints': 'Sin pistas',
    'Hints': 'Pistas',
    'Pause': 'Pausar',
    'Givens are locked · notes are yours.': 'Las pistas están fijas · las notas son tuyas.',
    'Drop · pair · grow': 'Suelta · empareja · crece',
    'Pair the same fruit. Don’t reach the top.': 'Une la misma fruta. No llegues arriba.',
    'Next': 'Siguiente',
    'Cherry': 'Cereza',
    'Drag to aim': 'Arrastra para apuntar',
    'Run over': 'Fin de la ronda',
    'Fruit reached the top.': 'La fruta llegó arriba.',
    'points · best': 'puntos · mejor',
    'Drag to aim. Release to drop.': 'Arrastra para apuntar. Suelta para dejar caer.',
    'Drag to aim · release to drop.': 'Arrastra para apuntar · suelta para dejar caer.',
    'You are X · first move': 'Eres X · primer movimiento',
    'Beat the computer to three in a row.': 'Gana a la máquina con tres en raya.',
    'Wins': 'Victorias',
    'Draws': 'Empates',
    'Losses': 'Derrotas',
    '2 players': '2 jugadores',
    'Your move. You are X.': 'Tu turno. Eres X.',
    'You win.': 'Ganas.',
    'Three in a row.': 'Tres en raya.',
    'New round': 'Nueva ronda',
    'You are X. The computer moves after you.': 'Eres X. La máquina mueve después.',
    'Beginner · 9 × 9': 'Principiante · 9 × 9',
    'Read the numbers. Clear every safe square.': 'Lee los números. Despeja cada casilla segura.',
    'Mines': 'Minas',
    'Flag mode': 'Modo bandera',
    'Tap a square to begin. Long-press to flag.': 'Toca una casilla para empezar. Mantén pulsado para marcar.',
    'Field cleared.': 'Campo despejado.',
    'Every safe square is open.': 'Todas las casillas seguras están abiertas.',
    'Tap to dig · tap a number to chord · hold to flag.': 'Toca para cavar · toca un número para abrir alrededor · mantén para marcar.',
    'Words': 'Palabras',
    'The hidden sixth sense': 'El sexto sentido oculto',
    'Six guesses. Five letters. One word.': 'Seis intentos. Cinco letras. Una palabra.',
    'Played': 'Jugadas',
    'Streak': 'Racha',
    'Round complete': 'Ronda completada',
    'Six tries. Five letters. Find the word.': 'Seis intentos. Cinco letras. Encuentra la palabra.',
    'Type on your keyboard or tap the letters.': 'Escribe en el teclado o toca las letras.',
    'Look & feel': 'Aspecto y ajustes',
    'Language': 'Idioma',
    'Home': 'Inicio',
    'Show today’s six games on the hub.': 'Muestra los seis juegos de hoy en la pantalla de inicio.',
    'Sudoku settings': 'Ajustes de Sudoku',
    'Saved on this device for every Sudoku puzzle.': 'Guardado en este dispositivo para cada Sudoku.',
    'Done': 'Hecho',
    'One look for every game. Saved on this device.': 'Un aspecto para todos los juegos. Guardado en este dispositivo.',
    'Theme': 'Tema',
    'Auto': 'Automático',
    'Light': 'Claro',
    'Dark': 'Oscuro',
    'Colours': 'Colores',
    'Accessibility': 'Accesibilidad',
    'High contrast': 'Alto contraste',
    'Stronger ink, borders and controls.': 'Tinta, bordes y controles más marcados.',
    'Off': 'Desactivado',
    'On': 'Activado',
    'Colour-blind cues': 'Señales para daltonismo',
    'Patterns and symbols alongside colour.': 'Patrones y símbolos junto al color.',
    'Larger Sudoku digits': 'Dígitos de Sudoku más grandes',
    'Bigger entries and notes on the grid.': 'Entradas y notas más grandes en la cuadrícula.',
    'Left-handed Sudoku': 'Sudoku para zurdos',
    'Board on the right in landscape.': 'Tablero a la derecha en horizontal.',
    'Hide timer': 'Ocultar temporizador',
    'Play Sudoku without a clock in view.': 'Juega al Sudoku sin reloj a la vista.',
    'Water Sort settings': 'Ajustes de Water Sort',
    'Minesweeper settings': 'Ajustes de Buscaminas',
    'Saved on this device for every Water Sort board.': 'Se guarda en este dispositivo para cada tablero de Water Sort.',
    'Saved on this device for every Minesweeper field.': 'Se guarda en este dispositivo para cada campo de Buscaminas.',
    'Larger mine numbers': 'Números de mina más grandes',
    'Bigger numbers on the board.': 'Números más grandes en el tablero.',
    'Play Sudoku and Minesweeper without a clock.': 'Juega al Sudoku y al Buscaminas sin reloj.',
    'Check mistakes': 'Comprobar errores',
    'Mark Sudoku entries that do not fit.': 'Marca las entradas de Sudoku que no encajan.',
    'Sudoku input': 'Entrada de Sudoku',
    'Cell first': 'Primero celda',
    'Digit first': 'Primero dígito',
    'Cell first selects a square, then a number. Digit first arms a number, then you tap its square.': 'Primero celda selecciona una casilla y luego un número. Primero dígito arma un número y luego tocas su casilla.',
    'Backup': 'Copia de seguridad',
    'Keep a copy of every board, score, streak and setting. A backup is a normal JSON file and stays on this device until you share it. Moving to a new phone? Export here, then restore there.': 'Guarda una copia de cada tablero, puntuación, racha y ajuste. La copia es un archivo JSON normal y se queda en este dispositivo hasta que la compartas. ¿Cambias de teléfono? Exporta aquí y restaura allí.',
    'Export backup': 'Exportar copia',
    'Restore backup': 'Restaurar copia',
    'This device': 'Este dispositivo',
    'Erase every game, score, streak, saved shape and appearance choice. Nothing outside Sixfold is touched.': 'Borra cada juego, puntuación, racha, forma guardada y elección de aspecto. No se toca nada fuera de Sixfold.',
    'Erase all data': 'Borrar todos los datos',
    'Each game also has its own reset in its bottom tool row.': 'Cada juego también tiene su propio reinicio en la fila de herramientas inferior.',
    'Erase everything?': '¿Borrar todo?',
    'Cancel': 'Cancelar',
    'Every board, best score, streak, saved shape and appearance choice on this device will be removed.': 'Se eliminarán todos los tableros, récords, rachas, formas guardadas y elecciones de aspecto de este dispositivo.',
    'Sixfold returns to a fresh install. This cannot be undone. Nothing outside Sixfold is affected.': 'Sixfold vuelve a una instalación nueva. Esto no se puede deshacer. No se ve afectado nada fuera de Sixfold.',
    'Yes, erase everything': 'Sí, borrar todo',
    'Merge board': 'Tablero de Merge',
    'Pick a board size. Changing it starts a new round.': 'Elige un tamaño de tablero. Cambiarlo inicia una nueva ronda.',
    '3 × 3 is a quick warm-up, 4 × 4 is the standard, and 5 × 5 is the long game. Each size keeps its own best score.': '3 × 3 es un calentamiento rápido, 4 × 4 es el estándar y 5 × 5 es la partida larga. Cada tamaño guarda su propio récord.',
    'Reset this game?': '¿Reiniciar este juego?',
    'Only this game’s saved progress will be cleared.': 'Solo se borrará el progreso guardado de este juego.',
    'Your look and every other game stay exactly as they are.': 'Tu aspecto y todos los demás juegos se quedan exactamente igual.',
    'Reset game': 'Reiniciar juego',
    'How to play': 'Cómo jugar',
    'Got it': 'Entendido',
    'Swipe or drag anywhere on the board, or use the arrow keys, to slide every tile.': 'Desliza o arrastra en cualquier parte del tablero, o usa las flechas, para mover todas las fichas.',
    'Two tiles with the same number merge into one and double, adding to your score.': 'Dos fichas con el mismo número se unen en una y se doblan, sumando a tu puntuación.',
    'Every move drops in a new tile. If the board fills with no merges left, the round ends.': 'Cada movimiento coloca una ficha nueva. Si el tablero se llena sin uniones posibles, la ronda termina.',
    'Aim for 2048. There is no undo, so a move cannot be taken back.': 'Busca 2048. No hay deshacer, así que un movimiento no se puede revertir.',
    'Your board is saved as you play — reopen the app and pick up where you left off.': 'Tu tablero se guarda mientras juegas: vuelve a abrir la app y continúa donde lo dejaste.',
    'About Sixfold': 'Acerca de Sixfold',
    'Install': 'Instalar',
    'Install Sixfold for an app-like window and offline play.': 'Instala Sixfold para tener una ventana tipo app y jugar sin conexión.',
    'Already installed but it won’t open? Remove the old app from your Home Screen or browser app settings, then try again. The phone controls the bottom system bar, so it keeps the colour it was given when the app was installed.': '¿Ya está instalada pero no se abre? Elimina la app antigua de la pantalla de inicio o de los ajustes del navegador y vuelve a intentarlo. El teléfono controla la barra inferior, así que conserva el color que tenía al instalarse.',
    'No accounts, ads or tracking. Your board, best scores and appearance choices stay on this device. Each game has its own reset in its tool row, so clearing one game never touches the others. Your light/dark choice is also remembered in a first-party cookie so an installed app can choose matching launch chrome.': 'Sin cuentas, anuncios ni rastreo. Tu tablero, récords y preferencias de aspecto se quedan en este dispositivo. Cada juego tiene su propio reinicio, así que borrar uno nunca toca los demás. La elección claro/oscuro también se recuerda en una cookie propia para que una app instalada elija el color de lanzamiento adecuado.',
    'Questions, bug reports or feedback?': '¿Preguntas, errores o comentarios?',
    'Open a discussion': 'Abrir una conversación',
    'Report a bug or send feedback': 'Informar de un error o enviar comentarios',
    'A backup is yours: export it from Look & feel whenever you want a copy.': 'La copia de seguridad es tuya: expórtala desde Aspecto y ajustes cuando quieras.',
    'Release notes live in': 'Las notas de la versión están en',
    'Version 6.0': 'Versión 6.0',
    'Difficulty': 'Dificultad',
    'Every puzzle has exactly one solution. Best times save on this device.': 'Cada puzle tiene exactamente una solución. Los mejores tiempos se guardan en este dispositivo.',
    'Daily calendar': 'Calendario diario',
    'Finish seeded 4 × 4': 'Termina el 4 × 4 con semilla',
    'Solve the daily grid': 'Resuelve la cuadrícula diaria',
    'Beat today’s computer': 'Gana a la máquina de hoy',
    'Clear today’s field': 'Despeja el campo de hoy',
    'Clear today’s level': 'Supera el nivel de hoy',
    'Finish today’s run': 'Termina la ronda de hoy',
    'Done': 'Hecho',
    'today': 'hoy',
    'Replay this Sudoku': 'Repetir este Sudoku',
    'Daily link copied.': 'Enlace diario copiado.',
    'Every game has a date-seeded daily. Pick one to begin.': 'Cada juego tiene un reto diario con semilla. Elige uno para empezar.',
    'Six of six. Today’s set is complete.': 'Seis de seis. El set de hoy está completo.',
    'No games checked in. The Sudoku can be replayed for this date; the other five scenarios are today only.': 'No hay partidas registradas. El Sudoku puede repetirse para esta fecha; los otros cinco escenarios son solo de hoy.',
    'Only the Sudoku archive can be replayed. Other games count today.': 'Solo se puede repetir el archivo de Sudoku. Los demás juegos cuentan hoy.',
    'A full set.': 'Set completo.',
    'You can still replay the Sudoku.': 'Aún puedes repetir el Sudoku.',
    'The last 30 local days. Any Sudoku can be replayed from its date; the other five games count on the day you finish them.': 'Los últimos 30 días locales. Cualquier Sudoku se puede repetir desde su fecha; los otros cinco juegos cuentan el día en que los terminas.',
    'Play this Sudoku': 'Jugar a este Sudoku',
    'Short, repeatable moves. Use Auto notes to fill candidates, then look for these patterns.': 'Movimientos cortos y repetibles. Usa Notas automáticas para llenar candidatos y busca estos patrones.',
    'One empty cell accepts only one digit. Every other digit already appears in its row, column or box.': 'Una celda vacía solo acepta un dígito. Los demás dígitos ya aparecen en su fila, columna o caja.',
    'Hidden single': 'Candidato oculto',
    'Within a row, column or box, a digit fits in only one cell. The cell may have other candidates, but this digit has nowhere else to go.': 'En una fila, columna o caja, un dígito solo cabe en una celda. La celda puede tener otros candidatos, pero este dígito no puede ir a otro sitio.',
    'Naked pair': 'Pareja desnuda',
    'Two cells in one unit contain the same two candidates. Those two digits can be removed from the other cells in that unit.': 'Dos celdas de una misma unidad contienen los mismos dos candidatos. Esos dos dígitos se pueden quitar de las demás celdas de la unidad.',
    'Pointing pair': 'Pareja apuntadora',
    'Inside a box, a digit’s candidates sit in one row or column. Remove that digit from the rest of that row or column.': 'Dentro de una caja, los candidatos de un dígito están en una fila o columna. Quita ese dígito del resto de esa fila o columna.',
    'Box-line reduction': 'Reducción caja-línea',
    'In a row or column, a digit’s candidates sit inside one box. Remove that digit from the other cells of that box.': 'En una fila o columna, los candidatos de un dígito están dentro de una caja. Quita ese dígito de las demás celdas de esa caja.',
    'X-Wing': 'X-Wing',
    'Two rows both confine a digit to the same two columns. Those columns can lose that digit everywhere else. The same idea works with two columns and two rows.': 'Dos filas limitan un dígito a las mismas dos columnas. Esas columnas pueden perder ese dígito en el resto. La misma idea funciona con dos columnas y dos filas.',
    'When no simple single is available, Hint will still keep you moving and say that it is revealing a cell.': 'Cuando no hay un candidato simple, Pista seguirá ayudándote y avisará de que revela una celda.',
    'A new Sixfold is ready. Reload to use it.': 'Hay un nuevo Sixfold listo. Recarga para usarlo.',
    'Reload': 'Recargar',
    'Later': 'Más tarde',
    'About and privacy': 'Acerca de y privacidad',
    'Appearance and colours': 'Aspecto y colores',
    'Back to all games': 'Volver a todos los juegos',
    'Board size': 'Tamaño del tablero',
    'Language': 'Idioma',
    'Game controls': 'Controles del juego',
    'Empty tube': 'Tubo vacío',
    'Berry colours': 'Colores baya',
    'Dusk colours': 'Colores crepúsculo',
    'Forest colours': 'Colores bosque',
    'Mono colours': 'Colores monocromos',
    'Ocean colours': 'Colores océano',
    'Warm colours': 'Colores cálidos',
    'Quick tutorial': 'Tutorial rápido',
    'Skip tutorial': 'Saltar tutorial',
    'Skip': 'Saltar',
    'Vibration off': 'Vibración desactivada',
    'Got it': 'Entendido',
    'Swipe or drag the board to move every tile.': 'Desliza o arrastra el tablero para mover todas las fichas.',
    'Two tiles with the same number merge into one and double, adding to your score.': 'Dos fichas con el mismo número se unen en una y se doblan, sumando a tu puntuación.',
    'Every move drops in a new tile. If the board fills with no merges left, the round ends.': 'Cada movimiento coloca una ficha nueva. Si el tablero se llena sin uniones posibles, la ronda termina.',
    'Push two matching numbers together to merge them.': 'Junta dos números iguales para unirlos.',
    'Keep going. A fresh tile appears after every move.': 'Sigue así. Aparece una ficha nueva después de cada movimiento.',
    'Tap a tube to pick up its top colour.': 'Toca un tubo para coger su color superior.',
    'Now tap a second tube to pour it.': 'Ahora toca un segundo tubo para verterlo.',
    'Nice. Keep pouring until each tube holds one colour.': 'Bien. Sigue vertiendo hasta que cada tubo tenga un solo color.',
    'Tap a cell, then a number from the pad.': 'Toca una celda y luego un número del teclado.',
    'Every row, column and 3 × 3 box needs 1–9 once.': 'Cada fila, columna y caja de 3 × 3 necesita 1–9 una vez.',
    'Use Notes for candidates and Hint when you are stuck.': 'Usa Notas para los candidatos y Pista cuando te bloquees.',
    'Drag across the board to aim the fruit.': 'Arrastra por el tablero para apuntar la fruta.',
    'Lift your finger to drop it.': 'Levanta el dedo para dejarla caer.',
    'Drop a matching fruit on top to make a bigger one.': 'Deja caer una fruta igual encima para crear una más grande.',
    'Tap any square to place your X.': 'Toca cualquier casilla para poner tu X.',
    'O answers. Look for a line of three.': 'O responde. Busca una línea de tres.',
    'Now place your second X. Three in a row wins.': 'Ahora pon tu segunda X. Tres en raya gana.',
    'Tap a square to open it. The first tap is always safe.': 'Toca una casilla para abrirla. La primera siempre es segura.',
    'Switch on Flag and tap a square to mark a mine.': 'Activa Bandera y toca una casilla para marcar una mina.',
    'This clears the current Merge board, all best scores and the tip history. Your look and board size stay as they are.': 'Esto borra el tablero de Merge actual, todos los récords y el historial de consejos. Tu aspecto y tamaño de tablero se mantienen.',
    'This clears Water Sort progress and starts again at level 1. Your other games are untouched.': 'Esto borra el progreso de Water Sort y vuelve a empezar en el nivel 1. Tus otros juegos no se tocan.',
    'This clears your Sudoku progress, saved puzzle, best times and stats, and starts a fresh Easy puzzle. Your other games are untouched.': 'Esto borra tu progreso de Sudoku, el puzle guardado, los mejores tiempos y las estadísticas, y empieza un puzle Fácil nuevo. Tus otros juegos no se tocan.',
    'This clears your Fruit Merge best score and starts a fresh run. Your other games are untouched.': 'Esto borra tu récord de Fruit Merge y empieza una ronda nueva. Tus otros juegos no se tocan.',
    'This clears your Tic Tac Toe records for both computer and two-player games and starts a new round. Your other games are untouched.': 'Esto borra tus récords de Tic Tac Toe contra la máquina y a dos jugadores y empieza una ronda nueva. Tus otros juegos no se tocan.',
    'This clears your Minesweeper field choice and starts a new Beginner field. Your other games are untouched.': 'Esto borra tu elección de campo de Minesweeper y empieza un campo Principiante nuevo. Tus otros juegos no se tocan.',
    'This clears your Wordle stats and starts a fresh word. Your other games are untouched.': 'Esto borra tus estadísticas de Wordle y empieza una palabra nueva. Tus otros juegos no se tocan.',
    'Tap a tube to pick up its top colour, then tap another tube to pour.': 'Toca un tubo para coger su color superior y luego otro tubo para verter.',
    'You can pour onto the same colour or into an empty tube.': 'Puedes verter sobre el mismo color o en un tubo vacío.',
    'A tube is finished when it holds four of one colour.': 'Un tubo está terminado cuando tiene cuatro del mismo color.',
    'Sort every colour, one tube each. If no move remains, undo or start a fresh board.': 'Ordena cada color en su tubo. Si no quedan movimientos, deshaz o empieza un tablero nuevo.',
    'Fill the 9 × 9 grid so every row, column and 3 × 3 box contains 1–9 exactly once.': 'Rellena la cuadrícula de 9 × 9 para que cada fila, columna y caja de 3 × 3 contenga 1–9 exactamente una vez.',
    'Tap a cell, then a number from the pad. Given clues are locked and cannot be erased.': 'Toca una celda y luego un número del teclado. Las pistas están bloqueadas y no se borran.',
    'Notes records small candidate numbers in a cell. Erase clears the selected cell.': 'Notas apunta pequeños candidatos en una celda. Borrar limpia la celda seleccionada.',
    'Undo takes back one move. Hint reveals one correct number and counts as a hint.': 'Deshacer retrocede un movimiento. Pista revela un número correcto y cuenta como pista.',
    'Every puzzle has exactly one solution. Complete the grid to stop the clock and save a best time.': 'Cada puzle tiene una sola solución. Completa la cuadrícula para parar el reloj y guardar un mejor tiempo.',
    'Easy, Medium, Hard and Expert each keep their own best time on this device.': 'Fácil, Medio, Difícil y Experto guardan su propio mejor tiempo en este dispositivo.',
    'Drag left or right to aim, then release to drop the fruit.': 'Arrastra a izquierda o derecha para apuntar y suelta para dejar caer la fruta.',
    'Two matching fruit join into the next, larger fruit.': 'Dos frutas iguales se unen en la siguiente fruta, más grande.',
    'Each merge scores the value of the pair you combine.': 'Cada unión suma el valor del par que combinas.',
    'Two watermelons clear both and keep the run going.': 'Dos sandías despejan ambas y mantienen la ronda.',
    'Keep the pile below the top line.': 'Mantén la pila por debajo de la línea superior.',
    'Bigger merges score more. The best score saves on this device.': 'Las uniones grandes puntúan más. El récord se guarda en este dispositivo.',
    'Tap any square to place your mark.': 'Toca cualquier casilla para poner tu marca.',
    'On the computer levels, O answers after every X move.': 'En los niveles de máquina, O responde después de cada movimiento de X.',
    'Easy plays loosely, Sharp takes wins and blocks, Perfect never misses.': 'Fácil juega suelto, Agudo aprovecha victorias y bloquea, Perfecto no falla.',
    'Choose 2 players to turn off the computer and pass the phone.': 'Elige 2 jugadores para desactivar la máquina y pasar el teléfono.',
    'Line up three marks across, down or diagonally to win.': 'Alinea tres marcas en horizontal, vertical o diagonal para ganar.',
    'Beginner is 9 × 9, Intermediate is 16 × 16, and Expert is 30 × 16 with 99 mines.': 'Principiante es 9 × 9, Intermedio es 16 × 16 y Experto es 30 × 16 con 99 minas.',
    'Tap a square to open it. Your first tap opens a safe pocket.': 'Toca una casilla para abrirla. Tu primer toque abre una zona segura.',
    'A number counts the mines in the eight surrounding squares.': 'Un número cuenta las minas de las ocho casillas que lo rodean.',
    'Long-press a square, or turn on Flag mode, to mark a mine.': 'Mantén pulsada una casilla o activa el modo Bandera para marcar una mina.',
    'Tap an open number to clear around it when its flags match.': 'Toca un número abierto para despejar alrededor cuando sus banderas coincidan.',
    'Open every safe square to clear the field. Flags are optional.': 'Abre todas las casillas seguras para despejar el campo. Las banderas son opcionales.',
    'Guess the five-letter word in six tries.': 'Adivina la palabra de cinco letras en seis intentos.',
    'Green means the letter is in the right spot. Yellow means it is in the word but in another spot. Gray means it is not in the word.': 'Verde significa que la letra está en el lugar correcto. Amarillo, que está en la palabra pero en otro lugar. Gris, que no está.',
    'Duplicate letters score only as many times as they appear in the answer.': 'Las letras repetidas puntúan solo tantas veces como aparecen en la respuesta.',
    'Type on a keyboard or tap the keys, then press Enter to submit.': 'Escribe en un teclado o toca las teclas y pulsa Intro para enviar.',
    'After a win or a loss, New game starts a fresh round.': 'Después de ganar o perder, Nueva partida empieza una ronda nueva.',
    'Choose Sudoku difficulty': 'Elegir dificultad del Sudoku',
    'Computer difficulty or two players': 'Dificultad de la máquina o dos jugadores',
    'Current and best daily streak': 'Racha diaria actual y mejor',
    'Dismiss': 'Descartar',
    'Dismiss install notice': 'Descartar aviso de instalación',
    'Dismiss what’s new': 'Descartar novedades',
    'Fruit Merge board': 'Tablero de Fruit Merge',
    'Fruit Merge score': 'Puntuación de Fruit Merge',
    'Game board': 'Tablero de juego',
    'Last 30 daily sets': 'Últimos 30 retos diarios',
    'Letter keyboard': 'Teclado de letras',
    'Minesweeper board': 'Tablero de Minesweeper',
    'Minesweeper progress': 'Progreso de Minesweeper',
    'Number pad': 'Teclado numérico',
    'Play Fruit Merge': 'Jugar a Fruit Merge',
    'Number Merge': 'Fusión de números',
    'Play Number Merge': 'Jugar a Fusión de números',
    'Number Merge score': 'Puntuación de Fusión de números',
    'Drop matching numbers. Don’t overflow.': 'Suelta números iguales. No dejes que se desborde.',
    'Pair the same number. Don’t reach the top.': 'Une números iguales. No llegues arriba del todo.',
    'Numbers mode': 'Modo números',
    'Swap fruit for numbered tiles.': 'Cambia la fruta por fichas numeradas.',
    'Fruit Merge settings': 'Ajustes de Fruit Merge',
    'Saved on this device for every Fruit Merge run.': 'Se guarda en este dispositivo para cada partida de Fruit Merge.',
    'Contrast, colour cues and larger text.': 'Contraste, pistas de color y texto más grande.',
    'Fruit Merge plays as fruit or numbered tiles, and the app icon now sits properly inside the launcher shape.': 'Fruit Merge se juega con fruta o con fichas numeradas, y el icono de la app ya encaja bien en la forma del lanzador.',
    'Play Merge': 'Jugar a Merge',
    'Play Minesweeper': 'Jugar a Minesweeper',
    'Play Sudoku': 'Jugar a Sudoku',
    'Play Tic Tac Toe': 'Jugar a Tic Tac Toe',
    'Play Water Sort': 'Jugar a Water Sort',
    'Reset Merge data': 'Restablecer datos de Merge',
    'Share result': 'Compartir resultado',
    'Share this game collection': 'Compartir esta colección',
    'Sixfold version 6.0': 'Sixfold versión 6.0',
    'Sudoku board': 'Tablero de Sudoku',
    'Sudoku controls': 'Controles de Sudoku',
    'Sudoku difficulty': 'Dificultad del Sudoku',
    'Sudoku input order': 'Orden de entrada del Sudoku',
    'Sudoku progress': 'Progreso de Sudoku',
    'Surprise me — open a random game': 'Sorpréndeme: abrir un juego al azar',
    'Tic Tac Toe board': 'Tablero de Tic Tac Toe',
    'Tic Tac Toe record': 'Récord de Tic Tac Toe',
    'Today’s six games': 'Los seis juegos de hoy',
    'Vibration': 'Vibración',
    'Vibration on': 'Vibración activada',
    'View result': 'Ver resultado',
    'Water Sort progress': 'Progreso de Water Sort',
    'Water Sort tubes': 'Tubos de Water Sort',
    'Wordle stats': 'Estadísticas de Wordle',
    'Ocean': 'Océano',
    'Forest': 'Bosque',
    'Berry': 'Baya',
    'Dusk': 'Crepúsculo',
    'Mono': 'Mono',
    'Strawberry': 'Fresa',
    'Grapes': 'Uvas',
    'Dekopon': 'Dekopon',
    'Persimmon': 'Caqui',
    'Apple': 'Manzana',
    'Pear': 'Pera',
    'Peach': 'Melocotón',
    'Pineapple': 'Piña',
    'Melon': 'Melón',
    'Watermelon': 'Sandía',
    'Daily Sudoku for': 'Sudoku diario para',
    'Merge': 'Merge',
    'Sudoku': 'Sudoku',
    'Tic Tac Toe': 'Tic Tac Toe',
    'Minesweeper': 'Minesweeper',
    'Water Sort': 'Water Sort',
    'Fruit Merge': 'Fruit Merge',
    "Daily": "Diario",
    "Today’s challenge": "El reto de hoy",
    "One game a day": "Un juego al día",
    "Can you finish it?": "¿Puedes completarlo?",
    "Your badge": "Tu insignia",
    "Six games": "Seis juegos",
    "Daily Sudoku": "Sudoku diario",
    "Copy is not available in this browser.": "Copiar no está disponible en este navegador.",
    "Copied": "Copiado",
    "DAY STREAK": "RACHA DE DÍAS",
    "GAMES / WEEK": "JUEGOS / SEMANA",
    "An offline pocket arcade.": "Una sala de juegos de bolsillo sin conexión.",
    "No ads. No accounts. Offline.": "Sin anuncios. Sin cuentas. Sin conexión.",
    "X wins": "Gana X",
    "O wins": "Gana O"
  };

  var PATTERNS = [
    [/^How to play (.+)$/, 'Cómo jugar a $1'],
    [/^Reset (.+)\?$/, '¿Restablecer $1?'],
    [/^Reset (.+)$/, 'Restablecer $1'],
    [/^This clears (.+) data on this device\.$/, 'Esto borra los datos de $1 en este dispositivo.'],
    [/^(\d+) by (\d+) board\. (.+)$/, function (match, w, h, rows) {
      return 'Tablero de ' + w + ' por ' + h + '. ' + rows.replace(/Row (\d+):/g, 'Fila $1:').replace(/\bempty\b/g, 'vacía');
    }],
    [/^Tube (\d+), (.+)$/, function (match, number, stateText) {
      var state = stateText
        .replace(/\bempty\b/g, 'vacío')
        .replace(/(\d+) of 4 full/g, '$1 de 4 lleno')
        .replace(/\bselected\b/g, 'seleccionado')
        .replace(/\bcoral\b/g, 'coral')
        .replace(/\bamber\b/g, 'ámbar')
        .replace(/\blime\b/g, 'lima')
        .replace(/\bteal\b/g, 'verde azulado')
        .replace(/\bblue\b/g, 'azul')
        .replace(/\bgrape\b/g, 'uva')
        .replace(/\brose\b/g, 'rosa');
      return 'Tubo ' + number + ', ' + state;
    }],
    [/^Reset (.+) data$/, 'Restablecer datos de $1'],
    [/^Board size, (\d+) by (\d+)$/, 'Tamaño del tablero, $1 por $2'],
    [/^Board size: (\d+) × (\d+)$/, 'Tamaño del tablero: $1 × $2'],
    [/^(Beginner|Intermediate|Expert) Minesweeper board, (\d+) columns by (\d+) rows$/, function (match, tier, cols, rows) {
      return 'Tablero de Minesweeper ' + word(tier).toLowerCase() + ', ' + cols + ' columnas por ' + rows + ' filas';
    }],
    [/^Fruit Merge board\. Score (\d+)\. Next fruit: (.+)\. Drag to aim, release to drop\. Arrow keys aim, space drops\.$/, function (match, score, fruit) {
      return 'Tablero de Fruit Merge. Puntos ' + score + '. Siguiente fruta: ' + fruit + '. Arrastra para apuntar y suelta para dejar caer. Las flechas apuntan y el espacio suelta.';
    }],
    [/^Row (\d+), column (\d+), (.+)$/, function (match, row, col, stateText) {
      var state = stateText
        .replace(/detonated mine/g, 'mina detonada')
        .replace(/misplaced flag/g, 'bandera mal colocada')
        .replace(/\bgiven\b/g, 'pista')
        .replace(/\bnotes\b/g, 'notas')
        .replace(/\bconflict\b/g, 'conflicto')
        .replace(/\bhidden\b/g, 'oculta')
        .replace(/\bflagged\b/g, 'marcada')
        .replace(/\bmine\b/g, 'mina')
        .replace(/\bempty\b/g, 'vacía');
      return 'Fila ' + row + ', columna ' + col + ', ' + state;
    }],
    [/^Score (\d+)$/, 'Puntos $1'],
    [/^Best (\d+)$/, 'Mejor $1'],
    [/^Moves (\d+)$/, 'Movimientos $1'],
    [/^(\d+) moves?$/, '$1 movimientos'],
    [/^(\d+) points · best (\d+)$/, '$1 puntos · mejor $2'],
    [/^(\d+) of six done · (\d+) to go\.$/, '$1 de seis hechos · faltan $2.'],
    [/^Play (.+) for today$/, 'Juega a $1 hoy'],
    [/^Replay (.+) for today$/, 'Repite $1 hoy'],
    [/^(.+), (\d+) of six games$/, '$1, $2 de seis juegos'],
    [/^Daily Sudoku for (.+)\.$/, 'Sudoku diario para $1.'],
    [/^Daily Sixfold · (.+)\. One solution\.$/, 'Sixfold diario · $1. Una solución.'],
    [/^Daily Sixfold · (.+)\. Solved\.$/, 'Sixfold diario · $1. Resuelto.'],
    [/^Daily Sixfold · ((?:(?!\. ).)+)\.$/, 'Sixfold diario · $1.'],
    [/^Tap a cell for (\d+)\.$/, 'Toca una celda para el $1.'],
    [/^All nine (\d+)s are already placed\.$/, 'Los nueve $1 ya están colocados.'],
    [/^Only (\d+) fits in this cell: every other digit already appears in its row, column or box\.$/, 'Solo el $1 cabe en esta celda: los demás dígitos ya aparecen en su fila, columna o caja.'],
    [/^(\d+) has only one possible square in (row|column|box) (\d+)\. The square itself may allow other numbers, but this digit cannot go anywhere else\.$/, function (match, digit, unit, number) {
      var names = { row: 'la fila', column: 'la columna', box: 'la caja' };
      return 'El ' + digit + ' solo tiene una casilla posible en ' + names[unit] + ' ' + number + '. La casilla puede admitir otros números, pero este dígito no puede ir a otro sitio.';
    }],
    [/^(Reveal|Place) (\d+)$/, function (match, action, digit) { return (action === 'Reveal' ? 'Revelar ' : 'Colocar ') + digit; }],
    [/^Revealed a (\d+)\.$/, 'Se reveló un $1.'],
    [/^(.+): placed (\d+)\.$/, function (match, title, digit) { return (ES[title] || title) + ': colocado el ' + digit + '.'; }],
    [/^(.+) in row (\d+), column (\d+)\.$/, function (match, title, row, col) { return (ES[title] || title) + ' en la fila ' + row + ', columna ' + col + '.'; }],
    [/^Building a unique (.+) puzzle…$/, 'Creando un puzle $1 único…'],
    [/^Building the (.+) daily puzzle…$/, 'Creando el puzle diario de $1…'],
    [/^(.+) puzzle ready\. One solution\.$/, '$1 listo. Una solución.'],
    [/^New round\. (.+)$/, function (match, copy) { return 'Nueva ronda. ' + (ES[copy] || copy); }],
    [/^Two watermelons cleared — \+(\d+)!$/, 'Dos sandías despejadas: +$1.'],
    [/^Dropped (.+)\. Pair it with another\.$/, 'Has soltado $1. Únelo con otra.'],
    [/^A (\d+)\. Count the mines around it\.$/, 'Un $1. Cuenta las minas alrededor.'],
    [/^All (\d+) flags are placed\. Remove one first\.$/, 'Las $1 banderas están colocadas. Quita una primero.'],
    [/^That number needs (\d+) flags? first\.$/, 'Ese número necesita $1 bandera(s) primero.'],
    [/^(\d+) × (\d+) • (\d+) moves?$/, '$1 × $2 • $3 movimientos'],
    [/^(?:Daily Sixfold · (.+?)\. )?(Easy|Medium|Hard|Expert) puzzle finished in (.+?) with (no hints|\d+ hints?)(?: and (\d+) checked mistakes?)?\.$/, function (match, date, level, time, hints, mistakes) {
      var copy = word(level) + ' completado en ' + time + ' ' + (hints === 'no hints' ? 'sin pistas' : 'con ' + hints.replace('hints', 'pistas').replace('hint', 'pista'));
      if (mistakes) copy += ' y ' + mistakes + ' ' + (mistakes === '1' ? 'error comprobado' : 'errores comprobados');
      return (date ? 'Sixfold diario · ' + date + '. ' : '') + copy + '.';
    }],
    [/^(\d+) puzzles? solved(?: · best (.+?))?(?: · (\d+) mistakes?)?$/, function (match, wins, best, mistakes) {
      var copy = wins + ' ' + (wins === '1' ? 'puzle resuelto' : 'puzles resueltos');
      if (best) copy += ' · mejor ' + best;
      if (mistakes) copy += ' · ' + mistakes + ' ' + (mistakes === '1' ? 'error' : 'errores');
      return copy;
    }],
    [/^(\d+) of six games checked in\. A full set\.$/, '$1 de seis juegos completados. Set completo.'],
    [/^(\d+) of six games checked in\. You can still replay the Sudoku\.$/, '$1 de seis juegos completados. Aún puedes repetir el Sudoku.'],
    [/^(\d+) checked off\. (\d+) of six today\.$/, '$1 completado. $2 de seis hoy.'],
    [/^Daily Sixfold complete\. All six games played\.$/, 'Sixfold diario completo. Los seis juegos jugados.'],
    [/^Level (\d+) of (\d+)$/, 'Nivel $1 de $2'],
    [/^(Easy|Medium|Hard) · Level (\d+) of (\d+)$/, function (match, tier, level, total) { return word(tier) + ' · Nivel ' + level + ' de ' + total; }],
    [/^You are X · (.+)$/, function (match, tier) { return 'Eres X · ' + word(tier); }],
    [/^Daily Sixfold\. Beat the seeded (.+) computer\.$/, function (match, tier) { return 'Sixfold diario. Gana a la máquina ' + word(tier).toLowerCase() + ' con semilla.'; }],
    [/^Daily Sixfold\. Seeded (.+) level\.$/, function (match, tier) { return 'Sixfold diario. Nivel ' + word(tier).toLowerCase() + ' con semilla.'; }],
    [/^Daily Sixfold\. Clear the seeded (.+) field\.$/, function (match, tier) { return 'Sixfold diario. Despeja el campo ' + word(tier).toLowerCase() + ' con semilla.'; }],
    [/^(\d+) guesses?$/, '$1 intentos'],
    [/^Wordle board, (\d+) of 6 guesses used$/, 'Tablero de Wordle, $1 de 6 intentos usados'],
    [/^The word was ([A-Z]+)\.$/, 'La palabra era $1.'],
    [/^(\d+) × (\d+)$/, '$1 × $2'],
    [/^(\d+) day streak$/, '$1 días seguidos'],
    [/^Daily Sixfold\. Clear this seeded level\.$/, 'Sixfold diario. Supera este nivel con semilla.'],
    [/^Daily Sixfold\. Seeded fruit run\.$/, 'Sixfold diario. Ronda de fruta con semilla.'],
    [/^Daily Sixfold run\. Seeded (\d+) by (\d+) board\.$/, 'Ronda de Sixfold diario. Tablero $1 por $2 con semilla.'],
    [/^Daily Sixfold\. Your move\. You are X\.$/, 'Sixfold diario. Tu turno. Eres X.'],
    [/^Daily Sixfold\. Drop fruit\.$/, 'Sixfold diario. Suelta fruta.'],
    [/^Daily Sixfold\. Seeded (\d+) by (\d+) — every new tile follows today’s sequence\.$/, 'Sixfold diario. $1 por $2 con semilla: cada ficha nueva sigue la secuencia de hoy.'],
    [/^New (\d+) by (\d+) board\.$/, 'Nuevo tablero de $1 por $2.'],
    [/^Resumed game\. Score (\d+)\.$/, 'Partida reanudada. Puntos $1.'],
    [/^A (\d+)\. Count the mines around it\.$/, 'Un $1. Cuenta las minas alrededor.'],
    [/^Open space\. Keep reading the numbers\.$/, 'Espacio abierto. Sigue leyendo los números.'],
    [/^Field cleared\. Every safe square is open\.$/, 'Campo despejado. Todas las casillas seguras están abiertas.'],
    [/^Daily challenge closed\. Fresh normal field\.$/, 'Reto diario cerrado. Campo normal nuevo.'],
    [/^Daily Sixfold\. Opening square revealed\. Clear the seeded field\.$/, 'Sixfold diario. Casilla inicial revelada. Despeja el campo con semilla.'],
    [/^You win\. Three in a row\.$/, 'Ganas. Tres en raya.'],
    [/^Computer wins this round\.$/, 'La máquina gana esta ronda.'],
    [/^A draw\. Every square filled\.$/, 'Empate. Todas las casillas llenas.'],
    [/^Fresh fruit\. Drag to aim, release to drop\.$/, 'Fruta nueva. Arrastra para apuntar y suelta para dejar caer.'],
    [/^Daily Sixfold\. Drag to aim, release to drop\.$/, 'Sixfold diario. Arrastra para apuntar y suelta para dejar caer.'],
    [/^The pile reached the top\. Start a fresh run\.$/, 'La pila llegó arriba. Empieza una ronda nueva.'],
    [/^Best score reset\. Fresh run\.$/, 'Récord restablecido. Ronda nueva.'],
    [/^Level clear\. Every colour has its own tube\.$/, 'Nivel superado. Cada color tiene su propio tubo.'],
    [/^Undone\. Take another look\.$/, 'Deshecho. Echa otro vistazo.'],
    [/^Selection cleared\.$/, 'Selección borrada.'],
    [/^Poured\. Keep going\.$/, 'Vertido. Sigue así.'],
    [/^No moves left\. Undo or start a fresh board\.$/, 'No quedan movimientos. Deshaz o empieza un tablero nuevo.'],
    [/^Fresh field\. The first square is always safe\.$/, 'Campo nuevo. La primera casilla siempre es segura.'],
    [/^Mine hit\. The field is revealed\.$/, 'Mina pisada. El campo está revelado.'],
    [/^Try the same seeded field again\.$/, 'Prueba de nuevo el mismo campo con semilla.'],
    [/^Try a fresh field\. The first square is always safe\.$/, 'Prueba un campo nuevo. La primera casilla siempre es segura.'],
    [/^Round complete\.$/, 'Ronda completada.'],
    [/^New round\.$/, 'Nueva ronda.'],
    [/^New puzzle\.$/, 'Nuevo puzle.'],
    [/^Paused\.$/, 'En pausa.']
  ];

  function catalogs() {
    var all = window.SixfoldCatalogs || {};
    all.es = {
      messages: ES,
      patterns: PATTERNS,
      meta: {
        title: 'Sixfold — Seis juegos. Sin relleno.',
        description: 'Seis juegos. Sin relleno. Un arcade de bolsillo sin conexión: Merge, Sudoku, Tic Tac Toe, Minesweeper, Water Sort y Fruit Merge. Sin cuentas y sin anuncios.',
        ogDescription: 'Seis juegos. Sin relleno. Un arcade de bolsillo sin conexión: seis puzles, sin cuentas y sin anuncios.'
      }
    };
    Object.keys(all).forEach(function (code) {
      if (!all[code].patterns) all[code].patterns = [];
      if (all[code].templates && !all[code].patterns.length && window.SixfoldPatterns) {
        all[code].patterns = window.SixfoldPatterns.build(all[code]);
      }
    });
    return all;
  }

  function detect() {
    return window.SixfoldLocale ? window.SixfoldLocale.detect() : 'en';
  }

  function word(value) {
    var text = String(value || '');
    var key = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    return catalog.messages[key] || catalog.messages[text.toLowerCase()] || value;
  }

  function lookup(value) {
    if (locale === 'en' || !value) return value;
    var direct = catalog.messages[value];
    if (direct) return direct;
    for (var i = 0; i < catalog.patterns.length; i += 1) {
      if (catalog.patterns[i][0].test(value)) {
        return value.replace(catalog.patterns[i][0], catalog.patterns[i][1]);
      }
    }
    return value;
  }

  function localizeDigits(value) {
    var digits = NUMERALS[locale];
    if (!digits) return String(value);
    return String(value).replace(/[0-9]/g, function (digit) { return digits[Number(digit)]; });
  }

  function translateValue(value) {
    var match = String(value).match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!match || !match[2]) return value;
    var core = match[2].replace(/\s+/g, ' ');
    return match[1] + localizeDigits(lookup(core)) + match[3];
  }

  function skip(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    return Boolean(el && el.closest && el.closest('script,style,code,pre,textarea,[data-i18n-skip]'));
  }

  function translateNode(node) {
    if (node.nodeType === 3) {
      if (skip(node)) return;
      var next = translateValue(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1) return;
    if (skip(node)) return;
    ['aria-label', 'title', 'placeholder', 'alt'].forEach(function (name) {
      if (!node.hasAttribute(name)) return;
      var value = node.getAttribute(name);
      var translated = translateValue(value);
      if (translated !== value) node.setAttribute(name, translated);
    });
    Array.prototype.forEach.call(node.childNodes, translateNode);
  }

  function translateTree(root) {
    if (locale === 'en' || !root) return;
    translateNode(root);
  }

  function translateHead() {
    if (locale === 'en') return;
    var meta = catalog.meta || {};
    var title = meta.title || catalog.messages['Sixfold — Six games. No filler.'];
    if (title) document.title = title;
    var description = document.querySelector('meta[name="description"]');
    if (description && meta.description) description.setAttribute('content', meta.description);
    ['og:title', 'twitter:title'].forEach(function (property) {
      var tag = document.querySelector('meta[property="' + property + '"], meta[name="' + property + '"]');
      if (tag && title) tag.setAttribute('content', title);
    });
    ['og:description', 'twitter:description'].forEach(function (property) {
      var tag = document.querySelector('meta[property="' + property + '"], meta[name="' + property + '"]');
      if (tag && meta.ogDescription) tag.setAttribute('content', meta.ogDescription);
    });
  }

  function bindLanguage() {
    var wrap = document.getElementById('language-seg');
    if (!wrap) return;
    var current = document.getElementById('language-current');
    if (current) {
      current.textContent = SUPPORTED[locale] || 'English';
      current.setAttribute('lang', locale);
    }
    wrap.querySelectorAll('[data-locale]').forEach(function (button) {
      button.setAttribute('aria-pressed', button.dataset.locale === locale ? 'true' : 'false');
      button.addEventListener('click', function () {
        var next = button.dataset.locale;
        if (!SUPPORTED[next]) return;
        try {
          localStorage.setItem(KEY, next);
          localStorage.setItem(window.SixfoldLocale.EXPLICIT_KEY, '1');
        } catch (err) {}
        if (next !== locale) location.reload();
      });
    });
  }

  function setLang() {
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL[locale] ? 'rtl' : 'ltr';
    // A detected locale is deliberately not persisted: it has to stay free to
    // follow the phone. Only bindLanguage() marks an explicit choice.
  }

  // A CSS font can occasionally fail its first decode in a browser even though
  // the same bytes load through the FontFace API (seen with the bundled JP
  // face). Register the active script face explicitly so canvas share cards
  // and the interface never fall back to tofu boxes.
  var SCRIPT_FACE = {
    'zh-Hans': { family: 'Sixfold SC', file: 'sixfold-sc.woff2?v=5.1.4', sample: '中' },
    'zh-Hant': { family: 'Sixfold TC', file: 'sixfold-tc.woff2?v=5.1.4', sample: '中' },
    ja: { family: 'Sixfold JP', file: 'sixfold-jp.woff2?v=5.1.4', sample: 'の' },
    ko: { family: 'Sixfold KR', file: 'sixfold-kr.woff2?v=5.1.4', sample: '한' },
    hi: { family: 'Sixfold Devanagari', file: 'sixfold-devanagari.woff2?v=5.1.4', sample: 'ह', digits: { family: 'Sixfold Devanagari Digits', file: 'sixfold-devanagari-digits.woff2?v=5.1.4', sample: '१' } },
    kn: { family: 'Sixfold Kannada', file: 'sixfold-kannada.woff2?v=5.1.4', sample: 'ಕ' },
    ar: { family: 'Sixfold Arabic', file: 'sixfold-arabic.woff2?v=5.1.4', sample: 'ت', digits: { family: 'Sixfold Arabic Digits', file: 'sixfold-arabic-digits.woff2?v=5.1.4', sample: '١' } }
  };

  function loadFace(face) {
    if (!face) return;
    try {
      if (document.fonts.check('16px "' + face.family + '"', face.sample)) return;
    } catch (err) {}
    fetch('fonts/' + face.file, { headers: { 'X-Sixfold-Active-Face': '1' } })
      .then(function (response) { return response.arrayBuffer(); })
      .then(function (buffer) {
        var loaded = new window.FontFace(face.family, buffer, { weight: '400', style: 'normal', display: 'swap' });
        return loaded.load().then(function () { document.fonts.add(loaded); });
      })
      .catch(function () {});
  }

  function ensureScriptFace() {
    var face = SCRIPT_FACE[locale];
    if (!face || !window.FontFace || !window.fetch || !document.fonts) return;
    loadFace(face);
    loadFace(face.digits);
  }

  function announceLocale() {
    if (!navigator.serviceWorker || !window.SixfoldLocale) return;
    navigator.serviceWorker.ready.then(function (registration) {
      var worker = registration.active || navigator.serviceWorker.controller;
      if (worker) worker.postMessage({ type: 'sixfold-active-locale', locale: locale });
    }).catch(function () {});
  }

  function warmScriptFace() {
    var face = SCRIPT_FACE[locale];
    if (!face) return;
    [face, face.digits].forEach(function (item) {
      if (!item) return;
      fetch('fonts/' + item.file, {
        cache: 'force-cache',
        headers: { 'X-Sixfold-Active-Face': '1' }
      }).catch(function () {});
    });
  }

  function cacheActiveLocale() {
    if (!navigator.serviceWorker || !window.SixfoldLocale) return;
    // Even English and Spanish have no separate catalog but still need to tell
    // the worker which dictionaries and script faces are now disposable.
    announceLocale();
    if (!navigator.onLine) return;
    var files = window.SixfoldLocale.assets(locale);
    if (!files.length) return;
    var warmed = false;
    function warm() {
      if (warmed) return;
      warmed = true;
      announceLocale();
      // The first visit may fetch the script face before the worker controls
      // the page. Fetch it again once controlled so the active face is in the
      // offline cache without shipping every script face in the shell.
      warmScriptFace();
      files.forEach(function (file) {
        fetch(file + '?v=' + window.SixfoldLocale.VERSION, { cache: 'force-cache' }).catch(function () {});
      });
    }
    // The first visit has no controller yet. Let the worker claim the page,
    // then cache the one pack this reader can actually open offline.
    navigator.serviceWorker.addEventListener('controllerchange', warm, { once: true });
    navigator.serviceWorker.ready.then(function () {
      if (navigator.serviceWorker.controller) warm();
    }).catch(function () {});
  }

  function init() {
    ensureScriptFace();
    cacheActiveLocale();
    translateHead();
    translateTree(document.body);
    bindLanguage();
    if ('MutationObserver' in window) {
      var pending = false;
      var observer = new MutationObserver(function () {
        if (pending) return;
        pending = true;
        window.requestAnimationFrame(function () {
          pending = false;
          translateTree(document.body);
        });
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-label', 'title', 'placeholder', 'alt']
      });
    }
  }

  // Resolve the locale as soon as the script runs. Game modules render on
  // DOMContentLoaded and need the locale before that event reaches them.
  locale = detect();
  catalog = catalogs()[locale] || { messages: {}, patterns: [] };
  setLang();

  // Follow a phone language change while the app is open, unless the reader
  // has picked a language themselves. A reload is the one path that keeps the
  // catalog, the document direction, the script face and the icon in step.
  if (window.addEventListener) {
    window.addEventListener('languagechange', function () {
      var explicit = false;
      try {
        explicit = localStorage.getItem(window.SixfoldLocale.EXPLICIT_KEY) === '1';
      } catch (err) {}
      if (!explicit && detect() !== locale) location.reload();
    });
  }

  window.SixfoldI18n = {
    locale: function () { return locale; },
    formatLocale: function () { return NUMBER_LOCALES[locale] || locale; },
    number: function (value) { return localizeDigits(value); },
    supported: SUPPORTED,
    t: function (value) { return locale === 'en' ? value : lookup(String(value)); },
    refresh: function (root) { translateTree(root || document.body); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
