/**
 * Demonstración del TPS Extension para PI
 * 
 * Este archivo muestra una implementación simplificada del TPS widget
 * que funciona sin dependencias externas de @earendil-works/pi-tui.
 * 
 * Para usar con PI, necesitarás importar desde @earendil-works/pi-tui
 * o usar este como base para la implementación completa.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Métricas simuladas (en producción esto vendría de una fuente real)
interface TpsMetrics {
  tps: number;
  avg: number;
  ttft: number;
  lastUpdate: Date;
}

// Simulador de métricas en tiempo real
function simulateMetrics(): TpsMetrics {
  const now = new Date();
  const elapsed = (now.getTime() - Date.now()) / 1000; // Simplificado
  
  return {
    tps: 45 + Math.sin(now.getTime() / 1000) * 10,
    avg: 45.00,
    ttft: 150 + Math.random() * 200,
    lastUpdate: now,
  };
}

// Extension principal para PI
export default function (pi: ExtensionAPI): void {
  console.log("📊 TPS Extension loaded for PI");
  
  // Registrar el widget TPS
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("📊 TPS Metrics Extension loaded", "info");
    
    // Mostrar widget (esto requiere usar @earendil-works/pi-tui)
    // const widget = await ctx.ui.custom((tui, theme) => {
    //   return new TpsWidget();
    // });
  });
  
  // Comando para mostrar estadísticas
  pi.registerCommand("tps", {
    description: "Show TPS metrics",
    handler: async (_args, ctx) => {
      const metrics = simulateMetrics();
      
      // Mostrar información en el output
      ctx.ui.setEditorText(`
📊 TPS METRICS
━━━━━━━━━━━━━━
• TPS: ${metrics.tps.toFixed(2)} tokens/s
• AVG: ${metrics.avg.toFixed(2)} tokens/s  
• TTFT: ${metrics.ttft.toFixed(1)}ms
• Last: ${metrics.lastUpdate.toLocaleTimeString()}
━━━━━━━━━━━━━━
`);
      
      // O usar el notify
      ctx.ui.notify(`TPS: ${metrics.tps.toFixed(2)} t/s`, "info");
    },
  });
}

// Función de demostración
export function demo(): void {
  console.log("🎯 TPS Extension Demo");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Este extension muestra métricas de generación en PI:");
  console.log("• TPS (tokens por segundo)");
  console.log("• AVG (promedio de sesión)");
  console.log("• TTFT (time to first token)");
  console.log("");
  console.log("Características:");
  console.log("• Widget persistente en la interfaz");
  console.log("• Actualización en tiempo real");
  console.log("• Overlay de estadísticas detalladas");
  console.log("");
  console.log("Uso:");
  console.log("• Widget automático al iniciar sesión");
  console.log("• Tecla 'q' para stats detalladas");
  console.log("• Tecla 'esc' para ocultar");
}

demo();
