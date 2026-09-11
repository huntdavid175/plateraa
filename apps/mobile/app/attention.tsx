import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { RefusedCommand } from '../src/offline/engine';
import { describeCommand } from '../src/tablet/describe';
import { useEngineState, useLocalQuery, useTablet } from '../src/tablet/TabletProvider';
import { Button } from '../src/ui/Button';
import { Header } from '../src/ui/Header';
import { colors, radius, space, text, timeOf } from '../src/ui/theme';

/** Changes the server refused. They were undone on the tablet and are never sent again. */
export default function NeedsAttention() {
  const { engine } = useTablet();
  const state = useEngineState(engine);
  const people = useLocalQuery<{ id: string; display_name: string }>(
    'SELECT id, display_name FROM staff',
  );
  const [refused, setRefused] = useState<RefusedCommand[] | null>(null);

  useEffect(() => {
    if (!engine) return;
    let current = true;
    void engine.needsAttention().then((list) => {
      if (current) setRefused(list);
    });
    return () => {
      current = false;
    };
  }, [engine, state?.needsAttention]);

  const nameOf = (staffId: string) =>
    people?.find((person) => person.id === staffId)?.display_name ?? 'Someone';

  return (
    <View style={styles.screen}>
      <Header title="Needs attention" />
      <Text style={styles.intro}>
        The server refused these changes, so the tablet undid them. Check what happened and put it
        right if needed, then mark each one as seen.
      </Text>
      {refused === null ? (
        <ActivityIndicator color={colors.ink} />
      ) : refused.length === 0 ? (
        <Text style={styles.intro}>Nothing needs attention.</Text>
      ) : (
        <FlatList
          data={refused}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.what}>{describeCommand(item)}</Text>
                <Text style={styles.why}>{item.message}</Text>
                <Text style={styles.meta}>
                  {nameOf(item.staffId)} · {timeOf(item.at)}
                </Text>
              </View>
              <Button label="Seen" kind="secondary" onPress={() => void engine?.dismiss(item.id)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.md, padding: space.lg, backgroundColor: colors.ground },
  intro: { fontSize: text.body, color: colors.muted },
  list: { gap: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius,
    padding: space.md,
  },
  rowText: { flex: 1, gap: space.xs },
  what: { fontSize: text.body, fontWeight: '700', color: colors.ink },
  why: { fontSize: text.body, color: colors.dangerInk },
  meta: { fontSize: text.small, color: colors.muted },
});
