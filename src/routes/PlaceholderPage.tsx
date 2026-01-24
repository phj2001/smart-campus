import { Card, Typography } from 'antd';

const { Title, Paragraph } = Typography;

type Props = {
  title: string;
  description: string;
};

export default function PlaceholderPage({ title, description }: Props) {
  return (
    <div className="placeholder-page">
      <Card>
        <Title level={4}>{title}</Title>
        <Paragraph type="secondary">{description}</Paragraph>
      </Card>
    </div>
  );
}
