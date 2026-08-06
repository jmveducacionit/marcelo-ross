; Instalador de la sucursal — Inno Setup 6.
; No se edita a mano: lo compila `node scripts/build-instalador.mjs`, que arma
; antes el payload en build/payload.
;
; Se instala SIN privilegios de administrador, en el perfil del usuario. No es
; por comodidad: la aplicación escribe su base de datos dentro del directorio de
; instalación, y en Program Files eso exigiría elevación en cada arranque.

#define Nombre        "POS Sucursal Zona Oeste"
#define Version       "1.0.0-demo"
#define Empresa       "Marcelo Ross Hombre"
#define Ejecutable    "iniciar.cmd"

[Setup]
AppId={{7B1F2C4E-9A3D-4E58-B6C1-POSZONAOESTE}
AppName={#Nombre}
AppVersion={#Version}
AppVerName={#Nombre} {#Version}
AppPublisher={#Empresa}
DefaultDirName={autopf}\POS Zona Oeste
DefaultGroupName=POS Zona Oeste
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\build
OutputBaseFilename=SetupPOS-ZonaOeste
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; El payload ronda los 300 MB; sin esto el instalador tarda de más en arrancar.
DiskSpanning=no
UninstallDisplayName={#Nombre}

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio"; Description: "Crear un acceso directo en el escritorio"; GroupDescription: "Accesos directos:"

[Files]
Source: "..\build\payload\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\POS Zona Oeste"; Filename: "{app}\{#Ejecutable}"; WorkingDir: "{app}"
Name: "{group}\Desinstalar POS Zona Oeste"; Filename: "{uninstallexe}"
Name: "{autodesktop}\POS Zona Oeste"; Filename: "{app}\{#Ejecutable}"; WorkingDir: "{app}"; Tasks: escritorio

[Run]
Filename: "{app}\{#Ejecutable}"; Description: "Iniciar el sistema ahora"; Flags: postinstall nowait shellexec

[UninstallDelete]
; Los archivos que la aplicación genera en tiempo de ejecución (el cluster de
; PostgreSQL vive en {app}\datos) no los conoce el desinstalador. Se borra el
; registro de PostgreSQL, pero NO `datos`: ahí están las ventas y el stock
; cargados durante la demostración, y borrarlos sin avisar sería destructivo.
Type: files; Name: "{app}\datos\postgres.log"
