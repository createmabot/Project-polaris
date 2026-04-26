import { Route, Switch } from "wouter";
import Home from "./pages/Home";
import AlertDetail from "./pages/AlertDetail";
import SymbolDetail from "./pages/SymbolDetail";
import NoteDetail from "./pages/NoteDetail";
import CompareCreate from "./pages/CompareCreate";
import ComparisonDetail from "./pages/ComparisonDetail";
import StrategyLab from "./pages/StrategyLab";
import BacktestDetail from "./pages/BacktestDetail";
import BacktestComparisonDetail from "./pages/BacktestComparisonDetail";
import BacktestList from "./pages/BacktestList";
import StrategyVersionList from "./pages/StrategyVersionList";
import StrategyVersionDetail from "./pages/StrategyVersionDetail";
import WatchlistManage from "./pages/WatchlistManage";
import PositionsManage from "./pages/PositionsManage";

function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/home" component={Home} />
      <Route path="/alerts/:alertId" component={AlertDetail} />
      <Route path="/symbols/:symbolId" component={SymbolDetail} />
      <Route path="/notes/:noteId" component={NoteDetail} />
      <Route path="/symbols/:symbolId/note/new" component={NoteDetail} />
      <Route path="/compare" component={CompareCreate} />
      <Route path="/strategy-lab" component={StrategyLab} />
      <Route path="/strategies/:strategyId/versions" component={StrategyVersionList} />
      <Route path="/strategy-versions/:versionId" component={StrategyVersionDetail} />
      <Route path="/watchlist" component={WatchlistManage} />
      <Route path="/positions" component={PositionsManage} />
      <Route path="/backtests" component={BacktestList} />
      <Route path="/backtests/:backtestId" component={BacktestDetail} />
      <Route path="/backtest-comparisons/:comparisonId" component={BacktestComparisonDetail} />
      <Route path="/comparisons/:comparisonId" component={ComparisonDetail} />
      <Route>404: No such page!</Route>
    </Switch>
  );
}

export default App;

