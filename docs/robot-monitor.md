# Live robot observation in the lab

Confirmed on 2026-10-07: Hermes Pro Max at `192.168.1.63:1448`, firmware
`4.6.4-rtm-cube2-20240204`. First inspection reported battery 100%,
`dockingStatus=on_dock`, localization quality 0, and no current-map POIs.

## Start

Run each command in its own PowerShell terminal from the project root:

```powershell
.\scripts\start-robot-monitor.ps1 -Service backend
.\scripts\start-robot-monitor.ps1 -Service admin
.\scripts\start-robot-monitor.ps1 -Service kiosk
```

Admin: `http://localhost:3000`, Kiosk: `http://localhost:3001/kiosk`.
Memory-mode login accounts follow README.md. Data in this inspection session is
temporary. The robot's map is displayed directly, without publishing navigation
destinations or seeding the demo building map.

## Read-only behavior

`HERMES_READ_ONLY=true` is the default for real hardware. The HTTP client rejects
all non-GET requests before contacting the robot. Startup abort and automatic
docking are disabled. Manual control, navigation, and remote E-Stop are disabled;
use the physical emergency stop on the robot if needed.

Movement-capable Hermes mode requires PostgreSQL. The user authorized enabling
the control console on 2026-10-07; actual movement remains operator initiated.

## Control console

Start PostgreSQL with `docker compose up -d postgres`, apply `pnpm --filter
@hermes/backend db:migrate`, then use `scripts/start-robot-control.ps1` instead
of the monitor script for each service. Open `http://localhost:3000/control`.
Login as `admin` with `INITIAL_ADMIN_PASSWORD` from the local root `.env`.
The kiosk token in `apps/kiosk/.env.local` must match the backend token.

Startup only reads the robot. Before an operator's first movement command,
speed limits are reduced if necessary and read back: linear 0.1 m/s and angular
0.3 rad/s. Existing lower limits are retained. Automatic docking is disabled.
Manual control requires acquiring the manual lock; release stops control.
Map selection only marks a destination; navigation requires a separate confirmation.
Navigation requires localization mode, quality at least 50, a fresh map, and a
known free destination. Initial mapping mode and quality 0 therefore block it.

Map snapshots and LiDAR update approximately every second over Socket.IO; robot
pose updates every 0.5 seconds. HTTP polling every 2 seconds provides fallback
and stale maps are indicated. The live viewer supports pan, zoom, a 1 m grid,
LiDAR visibility, and POI markers.

On `/map`, operators and admins can select a coordinate, name a POI, set its
heading in degrees, and save directly to the robot. Click a marker or list entry
to edit or delete a single POI. Writes are read back before reporting success;
updates retain unrelated metadata. Mapping mode and active jobs/manual locks
block editing. POI editing does not dispatch any movement action. Robot POIs are
separate from the simulated versioned-map POIs and kiosk destination registry.
`node scripts/check-robot-live.mjs` checks authenticated server-pushed maps and
page responses without sending any robot movement command.

The current firmware returns 404 for `/api/core/motion/v1/speed`; speed is shown
as unknown instead of disconnecting otherwise valid battery/pose telemetry.
The SLAM map retains its signed world origin and resolution. Localization quality
must be checked in the robot app before navigation is enabled.

Map decoding follows the manufacturer's
[REST map export example](https://wiki.slamtec.com/pages/viewpage.action?pageId=122617988)
and [OpenAPI specification](https://docs.slamtec.com/opt/swagger-conf.json).
