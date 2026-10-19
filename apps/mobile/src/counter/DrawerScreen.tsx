import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTablet } from '../tablet/TabletProvider';
import { Button } from '../ui/Button';
import { Label } from '../ui/Field';
import { cedis, colors, font, radii, space, text, themed, themedStyles, timeOf } from '../ui/theme';
import { closeDrawer, moveCash, openDrawer, type Counter } from './actions';
import { AmountSheet } from './AmountSheet';
import { seesDrawerResult, varianceWords, type ClosedDrawer, type DrawerMovement } from './drawer';
import { DrawerSheet } from './DrawerSheet';
import { useDrawer } from './hooks';

type Sheet = 'open' | 'DROP' | 'PAY_IN' | 'close' | null;

const MOVEMENT_WORDS: Record<DrawerMovement['type'], string> = {
  DROP: 'Taken out',
  PAY_IN: 'Put in',
  PAYOUT: 'Paid out (dashboard)',
};

const TONE_COLOURS = themed(() => ({
  good: colors.goodInk,
  amber: colors.amberInk,
  red: colors.redInk,
}));

/**
 * The cash drawer: open it with a float, take cash out to the safe or put some in, and close it
 * with a count. Closing is a blind count: what the tablet expected shows only after counting.
 * Open, it's two panes like the rest of the counter: the drawer and what can be done with it on
 * the left, the cash taken out and put in on the right.
 */
export function DrawerScreen({ counter }: { counter: Counter }) {
  const { staff } = useTablet();
  const drawer = useDrawer();
  const [sheet, setSheet] = useState<Sheet>(null);
  const done = () => setSheet(null);

  if (!drawer || !staff) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color={colors.brand} style={styles.loading} />
      </View>
    );
  }
  const { open, lastClosed } = drawer;

  return (
    <View style={styles.screen}>
      {open ? (
        <View style={styles.panes}>
          <ScrollView style={styles.main} contentContainerStyle={styles.mainContent}>
            <View style={styles.card}>
              <State open />
              <View style={styles.float}>
                <Label text="Float" />
                <Text style={styles.floatValue}>{cedis(open.float)}</Text>
                <Text style={styles.meta}>
                  Opened by {open.openedByName ?? 'someone'} at {timeOf(open.openedAt)}
                </Text>
              </View>
              <View style={styles.actions}>
                <Button
                  label="Take cash out"
                  kind="secondary"
                  grow
                  onPress={() => setSheet('DROP')}
                />
                <Button
                  label="Put cash in"
                  kind="secondary"
                  grow
                  onPress={() => setSheet('PAY_IN')}
                />
              </View>
            </View>

            <View style={styles.closeBlock}>
              <Button label="Close the drawer" onPress={() => setSheet('close')} />
              <Text style={styles.hint}>
                At the end of a shift, count the cash. The tablet then shows what it expected and
                any difference.
              </Text>
            </View>
          </ScrollView>

          <View style={styles.side}>
            <View style={styles.sideHead}>
              <Text style={styles.sideTitle}>Taken out and put in</Text>
              {open.movements.length > 0 && (
                <Text style={styles.sideCount}>{open.movements.length}</Text>
              )}
            </View>
            {open.movements.length === 0 ? (
              <View style={styles.none}>
                <Text style={styles.noneTitle}>Nothing yet</Text>
                <Text style={styles.noneHint}>
                  Cash going to the safe, or change brought in, shows here.
                </Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.movements}>
                {open.movements.map((movement, index) => (
                  <View key={movement.id} style={[styles.movement, index > 0 && styles.rule]}>
                    <View style={styles.grow}>
                      <Text style={styles.movementTitle}>
                        {MOVEMENT_WORDS[movement.type]}
                        {movement.note ? ` · ${movement.note}` : ''}
                      </Text>
                      <Text style={styles.movementMeta}>
                        {movement.staffName ?? 'Someone'} at {timeOf(movement.at)}
                      </Text>
                    </View>
                    <Text
                      style={[styles.movementAmount, movement.type === 'PAY_IN' && styles.cashIn]}
                    >
                      {movement.type === 'PAY_IN' ? '+ ' : '− '}
                      {cedis(movement.amount)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.closedContent}>
          <View style={styles.card}>
            <State open={false} />
            {lastClosed ? (
              <LastClose
                closed={lastClosed}
                showFigures={seesDrawerResult(staff, lastClosed.closedBy)}
              />
            ) : (
              <Text style={styles.meta}>
                Count the float into the drawer before the first cash sale.
              </Text>
            )}
          </View>
          <Button label="Open the drawer" onPress={() => setSheet('open')} />
        </ScrollView>
      )}

      <DrawerSheet
        visible={sheet === 'open'}
        skipLabel="Cancel"
        onOpen={async (float) => {
          await openDrawer(counter, float);
          done();
        }}
        onSkip={done}
      />
      {open && (
        <>
          <AmountSheet
            visible={sheet === 'DROP'}
            title="Take cash out of the drawer"
            body="For cash going to the safe or to the owner. Paying a supplier from the drawer is a payout, which a manager records on the dashboard."
            amountLabel="Cash taken out"
            action={(amount) => `Take out ${cedis(amount)}`}
            notePlaceholder="To the safe"
            onSubmit={async (amount, note) => {
              await moveCash(counter, { shiftId: open.id, type: 'DROP', amount, note });
              done();
            }}
            onClose={done}
          />
          <AmountSheet
            visible={sheet === 'PAY_IN'}
            title="Put cash into the drawer"
            body="For cash added to the drawer, like change brought from the bank."
            amountLabel="Cash put in"
            action={(amount) => `Put in ${cedis(amount)}`}
            notePlaceholder="Change from the bank"
            onSubmit={async (amount, note) => {
              await moveCash(counter, { shiftId: open.id, type: 'PAY_IN', amount, note });
              done();
            }}
            onClose={done}
          />
          <AmountSheet
            visible={sheet === 'close'}
            title="Close the drawer"
            body="Count all the cash in the drawer and enter it. The tablet then shows what it expected and any difference."
            amountLabel="Cash counted"
            action={(amount) => `Close with ${cedis(amount)} counted`}
            allowZero
            onSubmit={async (counted) => {
              await closeDrawer(counter, open.id, counted);
              done();
            }}
            onClose={done}
          />
        </>
      )}
    </View>
  );
}

/** "Drawer open" or "Drawer closed", with a dot: green while cash is being taken. */
function State({ open }: { open: boolean }) {
  return (
    <View style={styles.state}>
      <View style={[styles.dot, open && styles.dotOpen]} />
      <Text style={styles.title}>{open ? 'Drawer open' : 'Drawer closed'}</Text>
    </View>
  );
}

function LastClose({ closed, showFigures }: { closed: ClosedDrawer; showFigures: boolean }) {
  const difference = varianceWords(closed.variance);
  return (
    <>
      <Text style={styles.meta}>
        Last closed by {closed.closedByName ?? 'someone'} at {timeOf(closed.closedAt)}.
      </Text>
      {showFigures && (
        <View style={styles.figures}>
          <Figure label="Expected" value={cedis(closed.expected)} />
          <Figure label="Counted" value={cedis(closed.counted)} />
          <Figure
            label="Difference"
            value={difference.words}
            colour={TONE_COLOURS[difference.tone]}
          />
        </View>
      )}
      {showFigures && closed.provisional ? (
        <Text style={styles.hint}>
          Not uploaded yet. The server checks these figures once it is.
        </Text>
      ) : null}
    </>
  );
}

function Figure({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <View style={styles.figure}>
      <Label text={label} />
      <Text style={[styles.figureValue, colour ? { color: colour } : null]}>{value}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.ground },
  loading: { marginTop: space.xl },
  panes: { flex: 1, flexDirection: 'row' },
  main: { flex: 55 },
  mainContent: { flexGrow: 1, padding: space.lg, gap: space.lg },
  closedContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    padding: space.lg,
    gap: space.md,
  },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radii.xl,
    padding: space.lg,
    gap: 20,
  },
  state: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.disabled },
  dotOpen: { backgroundColor: colors.online },
  title: { fontFamily: font.semibold, fontSize: text.heading, color: colors.ink },
  float: { gap: 4 },
  floatValue: {
    fontFamily: font.monoMedium,
    fontSize: text.huge,
    lineHeight: 48,
    color: colors.ink,
  },
  meta: { fontFamily: font.regular, fontSize: text.body, lineHeight: 23, color: colors.text2 },
  actions: { flexDirection: 'row', gap: space.sm },
  /** At the foot of the pane: the end of the shift, kept apart from the moves during it. */
  closeBlock: { marginTop: 'auto', gap: space.sm },
  side: {
    flex: 45,
    backgroundColor: colors.canvas,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
  },
  sideHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sideTitle: { fontFamily: font.semibold, fontSize: 18, color: colors.ink },
  sideCount: { fontFamily: font.monoMedium, fontSize: text.small, color: colors.muted },
  none: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: space.xl },
  noneTitle: { fontFamily: font.medium, fontSize: text.body, color: colors.text2 },
  noneHint: {
    fontFamily: font.regular,
    fontSize: text.small,
    color: colors.muted,
    textAlign: 'center',
  },
  movements: { paddingHorizontal: space.lg, paddingBottom: space.md },
  grow: { flex: 1 },
  movement: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  rule: { borderTopWidth: 1, borderTopColor: colors.divider },
  movementTitle: { fontFamily: font.medium, fontSize: text.body, color: colors.ink },
  movementMeta: { fontFamily: font.regular, fontSize: text.small, color: colors.muted },
  movementAmount: { fontFamily: font.monoMedium, fontSize: text.body, color: colors.ink },
  cashIn: { color: colors.goodInk },
  hint: { fontFamily: font.regular, fontSize: text.small, lineHeight: 20, color: colors.muted },
  figures: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  figure: { flexGrow: 1, gap: 4 },
  figureValue: { fontFamily: font.monoMedium, fontSize: 22, color: colors.ink },
}));
