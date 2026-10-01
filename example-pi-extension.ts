/**
 * Ejemplo de uso del TPS Extension en PI
 * 
 * Este archivo muestra cómo integrar las métricas TPS en PI.
 * 
 * Opción 1: Extension inline (para pruebas rápidas)
 * ```typescript
 * // En tu archivo de extension de PI
 * import tpsExtension from './defdo_tps/pi-extension.ts';
 * 
 * // Registrar la extension
 * tpsExtension(pi);
 * ```
 * 
 * Opción 2: Extension separada en node_modules
 * ```bash
 * # Instalar como dependencia
 * bun add -p defdo-tps
 * 
 * // En tu extension
 * import tpsExtension from 'defdo-tps/pi-extension';
 * tpsExtension(pi);
 * ```
 * 
 * Opción 3: Extension personalizada que usa el core TPS
 * ```typescript
 * // Crear una extensión que acceda a métricas en tiempo real
 * pi.on('session_start', async (_event, ctx) => {
 *   // Acceder a métricas de generación
 *   const metrics = await ctx.model.getMetrics(); // API hipotética
 *   
 *   // Mostrar widget con métricas
 *   const widget = await ctx.ui.custom((tui, theme) => {
 *     return new TpsWidget({ metrics });
 *   });
 * });
 * ```
 * 
 * Nota: En la implementación real, las métricas TPS provendrían de:
 * - OpenCode: TUI plugin que accede al stream de mensajes
 * - Kimi Code: Lectura de ~/.kimi-code/sessions/
 * - PI: Podría acceder a métricas del modelo en uso
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import tpsExtension from "./pi-extension.ts";

// Registrar la extensión
export default function (pi: ExtensionAPI): void {
  // Inicializar TPS Extension
  tpsExtension(pi);
  
  // Personalizar si es necesario
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("📊 TPS Metrics Extension loaded", "info");
  });
}
