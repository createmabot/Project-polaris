import { Route, Switch } from "wouter";
import Home from "./pages/Home";
import AlertDetail from "./pages/AlertDetail";
import SymbolDetail from "./pages/SymbolDetail";
import NoteDetail from "./pages/NoteDetail";

function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/alerts/:alertId" component={AlertDetail} />
      <Route path="/symbols/:symbolId" component={SymbolDetail} />
      <Route path="/notes/:noteId" component={NoteDetail} />
      <Route path="/symbols/:symbolId/note/new" component={NoteDetail} />
      <Route>404: No such page!</Route>
    </Switch>
  );
}

export default App;
