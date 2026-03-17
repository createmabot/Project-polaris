import { Route, Switch } from "wouter";
import Home from "./pages/Home";
import AlertDetail from "./pages/AlertDetail";

function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/alerts/:alertId" component={AlertDetail} />
      <Route>404: No such page!</Route>
    </Switch>
  );
}

export default App;
