import { HashRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ClusterConfigurationPage } from "./components/modules/ClusterConfiguration";
import { DDLAnalysisPage } from "./components/modules/DDLAnalysis";
import { InsertionPage } from "./components/modules/Insertion";
import { PartitioningPage } from "./components/modules/Partitioning";
import { TokenRingPage } from "./components/modules/TokenRing";
import { ReplicaPlacementPage } from "./components/modules/ReplicaPlacement";
import { ConsistencyLevelPage } from "./components/modules/ConsistencyLevel";
import { GossipPage } from "./components/modules/Gossip";
import { WritePathPage } from "./components/modules/WritePath";
import { ReadPathPage } from "./components/modules/ReadPath";
import { UpdatePage } from "./components/modules/Update";
import { DeletePage } from "./components/modules/Delete";
import { FailurePage } from "./components/modules/Failure";
import { RebalancingPage } from "./components/modules/Rebalancing";
import { VirtualNodesPage } from "./components/modules/VirtualNodes";
import { ScenariosPage } from "./components/modules/Scenarios";
import { SurveyPage } from "./components/modules/Survey";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<ClusterConfigurationPage />} />
          <Route path="/ddl-analysis" element={<DDLAnalysisPage />} />
          <Route path="/insertion" element={<InsertionPage />} />
          <Route path="/partitioning" element={<PartitioningPage />} />
          <Route path="/token-ring" element={<TokenRingPage />} />
          <Route path="/replica-placement" element={<ReplicaPlacementPage />} />
          <Route path="/consistency-level" element={<ConsistencyLevelPage />} />
          <Route path="/gossip" element={<GossipPage />} />
          <Route path="/write-path" element={<WritePathPage />} />
          <Route path="/read-path" element={<ReadPathPage />} />
          <Route path="/update" element={<UpdatePage />} />
          <Route path="/delete" element={<DeletePage />} />
          <Route path="/failure" element={<FailurePage />} />
          <Route path="/rebalancing" element={<RebalancingPage />} />
          <Route path="/virtual-nodes" element={<VirtualNodesPage />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/survey" element={<SurveyPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
