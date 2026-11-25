// Public entry for the FYERS data provider, published as the
// `vela/providers/fyers` subpath.
//   import { FyersProvider } from 'vela/providers/fyers';
//   chart.data.registerProvider('fyers', new FyersProvider());
export { FyersProvider, normalizeTf, formatFyersSymbol } from './FyersProvider';
export type { FyersProviderConfig } from './FyersProvider';
export type { SymbolDescriptor, ProviderInfo, DataProvider } from '../../../core/ports/DataProvider';
