# Third-party notices

## Supertonic browser runtime

Obseri includes an adapted copy of the official Supertonic browser helper from
Supertone Inc.'s [`supertone-inc/supertonic`](https://github.com/supertone-inc/supertonic)
repository.

- Code copyright (c) 2025 Supertone Inc., licensed under the MIT License.
- Supertonic model weights are downloaded on demand from the pinned
  [`Supertone/supertonic-3`](https://huggingface.co/Supertone/supertonic-3)
  release and are licensed under OpenRAIL-M.
- Model execution happens on the visitor's device. Obseri does not redistribute
  the model weights in its application bundle.

The MIT license text for the adapted browser helper follows:

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Databuddy analytics adaptations

Adapted from the local Databuddy checkout at commit `92c15273d9a1e9a25f12be4aab84f2f7bf635d22`, with permission provided by the product owner:

- `packages/shared/src/country-codes.ts`: country-name/code data, retained in `src/lib/databuddy/country-codes.ts`. ISO codes are preserved without remapping.
- `packages/shared/src/utils/bot-detection/user-agent.ts` and `apps/basket/src/utils/user-agent.ts`: bounded UAParser-based browser/device parsing, adapted in `src/lib/visitor-context.ts`. Raw user agents are not persisted.
- `apps/dashboard/components/analytics/map-component.tsx`: country normalization and square-root intensity shading, adapted in `src/components/CountryMap.tsx` for a local SVG map and Obseri session metrics.
- The Natural Earth country geometry used by Databuddy at `https://cdn.databuddy.cc/geojson/countries.geojson`, converted to simplified SVG paths in `public/analytics/world-countries.json`. Natural Earth data is public domain. The complete country table remains available for countries too small to appear at this map scale.

Copyright (c) Databuddy Analytics, Inc. The upstream license is preserved in `licenses/Databuddy-LICENSE`.
