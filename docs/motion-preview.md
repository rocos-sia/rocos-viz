# Motion preview

The API contract is maintained in Apifox project 8387612, module 7912103. This is a client implementation note, not an OpenAPI snapshot.

Integration status (2026-11-03): published to Apifox project 8387612, module 7912103, main branch through the authorized official import API. MCP refresh and readback verified the preview operation, all three new schemas, unchanged existing operations/security definitions and API version 3.0.0. The MCP connection provides read/refresh capabilities.

In Manual teaching, choose Simulation to preview precise MoveJ, MoveL, MoveJ_IK or MoveL_FK commands through POST /api/robot/motion/preview. A controller connection is required; enable state and control ownership are not required for preview. Jogging is available only in Real robot mode in this first version.

The solid robot and realtime readouts always use controller feedback. Teal ghosts and the flange path use preview samples. After generation, the moving ghost automatically repeats forward from start to endpoint, then resets directly to the start without reverse playback. Each cycle follows the APP's time_from_start/duration and therefore its planned speed/acceleration profile, with interpolation between returned display samples. This is planned timing, not measured hardware tracking. Playback does not request another plan or send motion commands. Pause/resume and scrubbing remain available; scrubbing pauses playback. Automatic playback is disabled when the application or system requests reduced motion, but explicit playback is available. Hidden tabs suspend playback. The virtual endpoint becomes the start for the next preview, independent of the playback cursor. Use actual start resets the virtual session from the latest telemetry.

Switching modes never sends a motion command. Returning to Real robot restores existing credential, enable and screen-size checks. A user must send a new motion command, which the controller replans from its current position. The application does not execute a cached plan or replay preview-period input.

Pending requests are aborted and stale responses discarded when switching modes, resetting the start, leaving the page or changing controller/model/tool context. Preview requests time out after 15 seconds and never fall back to a real motion endpoint. Position, velocity and kinematic checks are reported separately from collision and live execution checks, which are not part of preview.

Validation: npm run test:control; npm run test:script; node --test test/motion-preview.test.mjs; npx playwright test test/browser/motion-preview.spec.ts test/browser/precise-control.spec.ts; npm run build. Browser tests use intercepted controller responses and a synthetic URDF, never real hardware.
