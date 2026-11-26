import { Composition, Folder } from "remotion";
import { FILM_DURATION, SCENES, ShasthoGridFilm } from "./ShasthoGridFilm";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="ShasthoGridFilm" component={ShasthoGridFilm} durationInFrames={FILM_DURATION} fps={30} width={1920} height={1080} />
      <Folder name="Scenes">
        {SCENES.map((s) => (
          <Composition key={s.name} id={`Scene-${s.name}`} component={s.C} durationInFrames={s.d} fps={30} width={1920} height={1080} />
        ))}
      </Folder>
    </>
  );
};
