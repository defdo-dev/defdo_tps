import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Text,
  Box,
  Spacer,
  DynamicBorder,
  matchesKey,
  Key,
  visibleWidth,
  truncateToWidth,
} from "@earendil-works/pi-tui";

/**
 * TPS Extension para PI
 * Muestra métricas de generación (TPS, AVG, TTFT) en tiempo real
 * Inspirado en defdo_tps pero adaptado al contexto de PI
 */

// Estado de métricas (simulado - en producción esto vendría de una fuente real)
interface TpsMetrics {
  tps: number;
  avg: number;
  ttft: number;
  startTime: number;
  lastUpdate: number;
}

const DEFAULT_METRICS: TpsMetrics = {
  tps: 0,
  avg: 0,
  ttft: 0,
  startTime: Date.now(),
  lastUpdate: Date.now(),
};

// Simulador de métricas en tiempo real (para demostración)
function simulateMetrics(): TpsMetrics {
  const now = Date.now();
  const elapsed = (now - DEFAULT_METRICS.startTime) / 1000; // segundos
  
  // Simular TPS variable (típicamente 20-100 para LLMs)
  const baseTps = 45; // promedio realista
  const variance = Math.sin(now / 1000) * 10; // fluctuación
  
  // Simular TTFT (Time To First Token) - típicamente 100-500ms
  const ttft = 150 + Math.random() * 200; 
  
  return {
    tps: Math.max(0, baseTps + variance),
    avg: baseTps,
    ttft: Math.round(ttft),
    startTime: DEFAULT_METRICS.startTime,
    lastUpdate: now,
  };
}

// Formateador de números
function formatNumber(num: number): string {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Formateador de tiempo
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Componente principal: TPS Widget
class TpsWidget extends Container {
  private metrics: TpsMetrics = DEFAULT_METRICS;
  private timerId: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
    this.updateDisplay();
  }
  
  // Actualizar métricas (llamar esto periódicamente)
  updateMetrics(newMetrics: TpsMetrics): void {
    this.metrics = newMetrics;
    this.invalidate();
  }
  
  // Simular actualización en tiempo real
  startAutoUpdate(): void {
    this.timerId = setInterval(() => {
      this.metrics = simulateMetrics();
      this.invalidate();
    }, 1000); // Actualizar cada segundo
  }
  
  // Limpiar timer
  stopAutoUpdate(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }
  
  private updateDisplay(): void {
    const metrics = this.metrics;
    const theme = this.getTheme();
    const elapsed = (Date.now() - metrics.startTime) / 1000;
    
    // Título
    const title = theme.fg("accent", theme.bold(" 📊 TPS Metrics"));
    
    // Línea 1: TPS actual
    const tpsLine = `${theme.fg("success", "●")} TPS: ${theme.bold(
      formatNumber(metrics.tps)
    )}`;
    
    // Línea 2: AVG
    const avgLine = `${theme.fg("muted", "◦")} AVG: ${formatNumber(metrics.avg)}`;
    
    // Línea 3: TTFT
    const ttftLine = `${theme.fg("dim", "○")} TTFT: ${formatTime(metrics.ttft)}`;
    
    // Línea 4: Contexto
    const context = `Session: ${elapsed.toFixed(1)}s • Refresh: 1s`;
    
    // Construir el contenido
    this.clear();
    
    // Contenedor con borde dinámico
    const border = new DynamicBorder((s) => theme.fg("accent", s));
    this.addChild(border);
    
    // Título
    this.addChild(new Text(title, 1, 0));
    
    // Métricas
    this.addChild(new Text(tpsLine, 2, 0));
    this.addChild(new Text(avgLine, 2, 0));
    this.addChild(new Text(ttftLine, 2, 0));
    
    // Spacer
    this.addChild(new Spacer(1));
    
    // Contexto
    this.addChild(new Text(context, 1, 0));
    
    // Ayuda
    const helpLine = theme.fg("dim", "• Show detailed stats: q | Hide: esc");
    this.addChild(new Text(helpLine, 1, 0));
    
    // Actualizar tema
    this.setTheme(theme);
  }
  
  render(width: number): string[] {
    const lines = this.children.map((c) => c.render(width));
    // Unir todos los lines
    return lines.flat();
  }
  
  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.stopAutoUpdate();
      // El widget se eliminará cuando se cierre el overlay
    } else if (matchesKey(data, Key.ctrl("q"))) {
      // Toggle auto-update
      if (this.timerId) {
        this.startAutoUpdate();
      } else {
        this.stopAutoUpdate();
      }
      this.invalidate();
    }
  }
}

// Componente detallado: Overlay de estadísticas
class DetailedStatsOverlay extends Container {
  private metrics: TpsMetrics = DEFAULT_METRICS;
  private timerId: NodeJS.Timeout | null = null;
  private selected: number = 0;
  private stats: string[] = [];
  
  constructor() {
    super();
    this.buildStats();
    this.startAutoUpdate();
  }
  
  private buildStats(): void {
    const m = this.metrics;
    this.stats = [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📊 TPS METRICS - DETAILED`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `🔢 THROUGHPUT`,
      `  Current: ${formatNumber(m.tps)} tokens/s`,
      `  Average: ${formatNumber(m.avg)} tokens/s`,
      `  Window: 5s rolling`,
      ``,
      `⏱️ LATENCY`,
      `  TTFT: ${formatTime(m.ttft)}`,
      `  Total: ${(Date.now() - m.startTime)/1000}s`,
      ``,
      `📈 GENERATED`,
      `  Current session: ~${(m.tps * 5).toFixed(0)} tokens`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `• Close: esc | Refresh: q`,
    ];
  }
  
  private startAutoUpdate(): void {
    this.timerId = setInterval(() => {
      this.metrics = simulateMetrics();
      this.buildStats();
      this.invalidate();
    }, 1000);
  }
  
  render(width: number): string[] {
    const lines = this.stats.map((line) => truncateToWidth(line, width));
    // Añadir borde dinámico
    const border = new DynamicBorder((s) => this.getTheme().fg("accent", s));
    const borderLines = border.render(width);
    return [...borderLines, ...lines, ...borderLines];
  }
  
  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.close();
    } else if (matchesKey(data, Key.ctrl("q"))) {
      this.invalidate();
    }
  }
  
  close(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    // El overlay se eliminará automáticamente
  }
}

// Extension principal
export default function (pi: ExtensionAPI): void {
  // Inicializar al inicio de la sesión
  pi.on("session_start", async (_event, ctx) => {
    // Registrar el widget TPS
    ctx.ui.custom<TpsWidget>((tui, theme, keybindings, done) => {
      const widget = new TpsWidget();
      widget.setTheme(theme);
      
      // Permitir cerrar con esc
      widget.handleInput = (data) => {
        if (matchesKey(data, Key.escape)) {
          widget.stopAutoUpdate();
          done(null);
        } else if (matchesKey(data, Key.ctrl("q"))) {
          widget.startAutoUpdate();
          widget.invalidate();
        }
        tui.requestRender();
      };
      
      return {
        render: (width) => widget.render(width),
        handleInput: (data) => {
          widget.handleInput(data);
          tui.requestRender();
        },
        invalidate: () => widget.invalidate(),
      };
    });
    
    // Registrar overlay de estadísticas detalladas
    ctx.ui.custom<DetailedStatsOverlay>((tui, theme, keybindings, done) => {
      const overlay = new DetailedStatsOverlay();
      overlay.setTheme(theme);
      
      return {
        render: (width) => overlay.render(width),
        handleInput: (data) => {
          overlay.handleInput(data);
          tui.requestRender();
        },
        invalidate: () => overlay.invalidate(),
      };
    });
    
    // Opcional: Agregar al footer si hay espacio
    // ctx.ui.setFooter((tui, theme, footerData) => ({
    //   render(width: number): string[] {
    //     // Esto requiere acceder al estado interno, mejor usar widget
    //     return [];
    //   },
    // }));
  });
  
  // Comando para mostrar/ocultar el widget
  pi.registerCommand("tps", {
    description: "Show TPS metrics widget",
    handler: async (_args, ctx) => {
      // El widget ya está disponible en el overlay
      const result = await ctx.ui.custom<string | null>((tui, theme, keybindings, done) => {
        return {
          render: (width) => [theme.fg("success", "✓ TPS widget is active")],
          invalidate: () => {},
          handleInput: (_data) => {},
        };
      });
      
      ctx.ui.notify(`TPS Metrics: ${result || "active"}`, "info");
    },
  });
}

// Exportar para pruebas
export { TpsWidget, DetailedStatsOverlay, simulateMetrics };
