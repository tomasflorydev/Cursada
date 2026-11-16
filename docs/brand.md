# Marca de Cursada

## Archivos

| Archivo | Uso |
| --- | --- |
| `build/icon-dark.svg` | Fuente del ícono de la app (default). Fondo grafito `#1E2023`, C blanca, punto coral. |
| `build/icon.png`, `build/icon.icns` | Generados desde `icon-dark.svg` con `bash scripts/build-icons.sh` (requiere `brew install librsvg`). |
| `src/assets/cursada-mark.svg` | Marca sola (C + punto), sin fondo. La C usa `currentColor`. |
| `src/components/brand/CursadaMark.tsx` | Componente React `<CursadaMark size={24} />` con el SVG inline. |

La versión clara del ícono (`build/icon-light.svg`, fondo `#FBFAF7`) queda pendiente y se agrega más adelante.

## Reglas de uso

- La C y el punto nunca se separan ni cambian de proporción.
- El punto siempre es coral `#FF5F52`.
- La C es blanca sobre fondo oscuro, o grafito `#1E2023` sobre fondo claro.
- Tamaño mínimo de la marca: **16px**.
- Fondos permitidos: grafito `#1E2023` o papel `#FBFAF7`.
- Sin animaciones, sombras, gradientes ni efectos sobre la marca.

## Wordmark

- Marca a 24px + texto "Cursada." a la derecha, alineado a la izquierda.
- Fuente de la app (Archivo), peso 600, `letter-spacing: -0.035em`.
- El punto final del wordmark va en el color de acento `#FF5F52` (`var(--accent)`).
- Estilo suizo: sin sombras ni gradientes.
