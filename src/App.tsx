import { Layout, Menu } from 'antd';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import MapPage from './routes/MapPage';
import PlaceholderPage from './routes/PlaceholderPage';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/map', label: 'Map' },
  { key: '/routes', label: 'Routing' },
  { key: '/assets', label: 'Assets' },
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Layout className="app-shell">
      <Header className="app-header">Smart Campus 3D</Header>
      <Layout>
        <Sider width={220} className="app-sider">
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
          />
        </Sider>
        <Content className="app-content">
          <Routes>
            <Route path="/map" element={<MapPage />} />
            <Route
              path="/routes"
              element={
                <PlaceholderPage
                  title="Routing module"
                  description="Route planning, navigation rules, and path analysis will live here."
                />
              }
            />
            <Route
              path="/assets"
              element={
                <PlaceholderPage
                  title="Asset management"
                  description="Campus assets, POI data, and facility management dashboards."
                />
              }
            />
            <Route path="*" element={<Navigate to="/map" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
